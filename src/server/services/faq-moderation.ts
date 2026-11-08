import 'server-only';

import {
  decideFaqOutputSchema,
  faqModerationPageSchema,
  listFaqModerationQueueSchema,
  publishFaqOutputSchema,
  publishFaqSchema,
  redirectFaqSchema,
  rejectFaqSchema,
  type DecideFaqOutput,
  type FaqModerationPage,
  type ListFaqModerationQueueInput,
  type PublishFaqInput,
  type PublishFaqOutput,
  type RedirectFaqInput,
  type RejectFaqInput,
} from '@/contracts/faq';
import { codedConflict, codedForbidden, codedNotFound, codedValidation } from '@/lib/errors';

import { findIdentityLeak } from '../rules/faq';
import {
  covers,
  idCursorWhere,
  loadAnyAdmin,
  nowOf,
  readAsAdmin,
  toPage,
  TX_OPTIONS,
  type AdminDeps,
  type Tx,
} from './admin-access';
import { recordAdminAction } from './audit';
import { emitEvent } from './event';
import { stageNotification } from './notification-intent';
import { awardFaqInTx } from './points';

/**
 * SSS moderasyonu (P1-17): kuyruk, yayın (düzenleyerek), ret, mentorluğa yönlendirme. Yetki işlemin içinde yeniden yüklenir
 * (`loadAnyAdmin`) ve talebin YAZILDIĞI bölümün kapsamıyla doğrulanır. Karar ve işlem kaydı AYNI işlemde yazılır. Soran ve
 * cevap verenler moderatöre görünmez; yayın metninde bu kişilerin adı/kimliği bulunamaz (`FAQ_IDENTITY_LEAK`).
 */

async function lockedOpenRequest(tx: Tx, requestId: string) {
  await tx.$queryRaw`SELECT "id" FROM "FaqRequest" WHERE "id"=${requestId} FOR UPDATE`;
  const request = await tx.faqRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      askerId: true,
      departmentIdAtWrite: true,
      asker: { select: { name: true } },
      answers: {
        orderBy: { id: 'asc' },
        select: { id: true, mentorId: true, mentor: { select: { name: true } } },
      },
    },
  });
  if (!request) throw codedNotFound('RESOURCE_NOT_FOUND');
  return request;
}

/** Kapsam dışı talep için yetkisiz yanıtı (deneyim moderasyonuyla aynı); karar verilmiş talep `FAQ_REQUEST_CLOSED`. */
async function requireOpenInScope(
  tx: Tx,
  admin: Awaited<ReturnType<typeof loadAnyAdmin>>,
  requestId: string,
) {
  const request = await lockedOpenRequest(tx, requestId);
  if (!(await covers(tx, admin, request.departmentIdAtWrite)))
    throw codedForbidden('AUTH_FORBIDDEN');
  if (request.status !== 'OPEN') throw codedConflict('FAQ_REQUEST_CLOSED');
  return request;
}

/** Yöneticinin kapsamındaki bölümlerin açık talepleri (eskiden yeniye değil, yeniden eskiye); kimliksiz. */
export async function listFaqModerationQueue(
  deps: AdminDeps,
  adminId: string,
  input: ListFaqModerationQueueInput,
): Promise<FaqModerationPage> {
  const parsed = listFaqModerationQueueSchema.parse(input);
  return readAsAdmin(deps, adminId, 'ANY_ADMIN', async ({ tx, departmentIds }) => {
    const rows = await tx.faqRequest.findMany({
      where: {
        status: 'OPEN',
        departmentIdAtWrite: { in: departmentIds },
        ...idCursorWhere(parsed.cursor),
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
      select: {
        id: true,
        question: true,
        createdAt: true,
        answers: { orderBy: { id: 'asc' }, select: { id: true, body: true } },
      },
    });
    const page = toPage(rows, parsed.limit);
    return faqModerationPageSchema.parse(page);
  });
}

/**
 * Yayınlar: seçilen cevap bu talebe ait olmalı; moderatörün düzenlediği soru/cevap metni soran ve TÜM cevap verenlerin
 * adını, e-posta/telefon biçimini içeremez. Puanlar yayınla AYNI işlemde yazılır (idempotent).
 */
export async function publishFaq(
  deps: AdminDeps,
  adminId: string,
  input: PublishFaqInput,
): Promise<PublishFaqOutput> {
  const parsed = publishFaqSchema.parse(input);
  const now = nowOf(deps);
  let asker: string | null = null;
  const output = await deps.db.$transaction(async (tx) => {
    const admin = await loadAnyAdmin(tx, adminId, now);
    const request = await requireOpenInScope(tx, admin, parsed.requestId);
    const selected = request.answers.find((answer) => answer.id === parsed.selectedAnswerId);
    if (!selected) throw codedNotFound('RESOURCE_NOT_FOUND');
    const names = [
      request.asker?.name,
      ...request.answers.map((answer) => answer.mentor?.name),
    ].filter((name): name is string => typeof name === 'string');
    if (findIdentityLeak(parsed.question, names) || findIdentityLeak(parsed.answer, names))
      throw codedValidation('FAQ_IDENTITY_LEAK');
    const item = await tx.faqItem.create({
      data: {
        sourceRequestId: request.id,
        departmentIdAtWrite: request.departmentIdAtWrite,
        question: parsed.question,
        answer: parsed.answer,
        publishedById: adminId,
        publishedAt: now,
      },
      select: { id: true },
    });
    await tx.faqAnswer.update({ where: { id: selected.id }, data: { isSelected: true } });
    await tx.faqRequest.update({
      where: { id: request.id },
      data: { status: 'PUBLISHED', decidedAt: now, decidedById: adminId },
    });
    await recordAdminAction(tx, {
      actor: admin,
      action: 'MODERATION_PUBLISH',
      targetType: 'FAQ_REQUEST',
      targetId: request.id,
      metadata: { answerCount: request.answers.length },
    });
    // Bildirimler (outbox): soran ve cevabı bulunan mentorlar; metinlerde ad/içerik yok.
    if (request.askerId)
      await stageNotification(tx, request.askerId, {
        type: 'generic',
        event: 'faqPublished',
        eventId: request.id,
        path: '/hesap/sss',
      });
    for (const answer of request.answers)
      if (answer.mentorId)
        await stageNotification(tx, answer.mentorId, {
          type: 'generic',
          event: 'faqAnswerPublished',
          eventId: answer.id,
          path: '/hesap/sss',
        });
    // Puanlar yayınla AYNI işlemde (docs/data.md); idempotent anahtar çift yazımı önler, uzlaştırma güvenlik ağıdır.
    await awardFaqInTx(tx, request.id, now);
    asker = request.askerId;
    return publishFaqOutputSchema.parse({ faqItemId: item.id });
  }, TX_OPTIONS);
  if (asker) emitEvent(deps.db, asker, { type: 'FAQ_PUBLISHED', props: {} });
  return output;
}

type DecisionKind = 'REJECTED' | 'REDIRECTED';
async function decide(
  deps: AdminDeps,
  adminId: string,
  requestId: string,
  note: string,
  status: DecisionKind,
): Promise<DecideFaqOutput> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const admin = await loadAnyAdmin(tx, adminId, now);
    const request = await requireOpenInScope(tx, admin, requestId);
    await tx.faqRequest.update({
      where: { id: request.id },
      data: { status, decisionNote: note, decidedAt: now, decidedById: adminId },
    });
    await recordAdminAction(tx, {
      actor: admin,
      action: status === 'REJECTED' ? 'MODERATION_REJECT' : 'MODERATION_REDIRECT',
      targetType: 'FAQ_REQUEST',
      targetId: request.id,
      reason: note,
    });
    if (request.askerId)
      await stageNotification(tx, request.askerId, {
        type: 'generic',
        event: status === 'REJECTED' ? 'faqRejected' : 'faqRedirected',
        eventId: request.id,
        path: '/hesap/sss',
      });
    return decideFaqOutputSchema.parse({ requestId: request.id, status });
  }, TX_OPTIONS);
}

/** Gerekçeyle reddeder; gerekçe soran öğrenciye gösterilir (kişisel veri biçimi işlem kaydında reddedilir). */
export async function rejectFaq(
  deps: AdminDeps,
  adminId: string,
  input: RejectFaqInput,
): Promise<DecideFaqOutput> {
  const parsed = rejectFaqSchema.parse(input);
  return decide(deps, adminId, parsed.requestId, parsed.reason, 'REJECTED');
}

/** Kişisel/tek seferlik soruyu mentorluğa yönlendirir; öğrenci mentor dizinine bağlantı görür. */
export async function redirectFaq(
  deps: AdminDeps,
  adminId: string,
  input: RedirectFaqInput,
): Promise<DecideFaqOutput> {
  const parsed = redirectFaqSchema.parse(input);
  return decide(deps, adminId, parsed.requestId, parsed.note, 'REDIRECTED');
}

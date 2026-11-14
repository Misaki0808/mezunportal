import 'server-only';

import {
  FAQ_MENTOR_DIRECTORY_HREF,
  FAQ_SIMILAR_LIMIT,
  answerFaqRequestSchema,
  faqSuggestionsSchema,
  getFaqItemSchema,
  listFaqRequestsForMentorSchema,
  listMyFaqRequestsSchema,
  searchFaqSchema,
  submitFaqRequestSchema,
  suggestSimilarFaqsSchema,
  type AnswerFaqRequestInput,
  type AnswerFaqRequestOutput,
  type FaqItemView,
  type FaqSearchPage,
  type FaqSuggestion,
  type GetFaqItemInput,
  type ListFaqRequestsForMentorInput,
  type ListMyFaqRequestsInput,
  type MentorFaqRequestPage,
  type MyFaqRequestPage,
  type SearchFaqInput,
  type SubmitFaqRequestInput,
  type SubmitFaqRequestOutput,
  type SuggestSimilarFaqsInput,
} from '@/contracts/faq';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { codedConflict, codedForbidden, codedNotFound, codedValidation } from '@/lib/errors';

import { createPermissions, errorForDenyReason } from '../permissions/guards';
import type { Actor } from '../permissions/actor';
import { findFaqRow, searchFaqRows, similarFaqRows } from '../repositories/faq';
import { hasPersonalDataPattern } from '@/lib/personal-data';
import { idCursorWhere, toPage } from './admin-access';
import { emitEvent, subjectFromActor } from './event';
import { requireConsent } from './privacy';
import { RATE_LIMITS, consumeRateLimit } from './rateLimit';
import { viewerUniversityIds } from './search';

/**
 * SSS servisi: öğrenci (talep, benzer soru, kendi talepleri), mentor (cevap), herkes (sayfa/arama). Kimlik hiçbir yanıta
 * girmez: soran mentora/moderatöre, cevap veren başkasına görünmez; yayın kimliksizdir. Yetki işlemin içinde, kullanıcı
 * satırı `FOR SHARE` kilidiyle (hesap silmeyle sıralanır) yeniden yüklenir.
 */

export type FaqDeps = { db: PrismaClient; now?: () => Date };
const nowOf = (deps: FaqDeps) => (deps.now ?? (() => new Date()))();
type Tx = Prisma.TransactionClient;
type Role = 'STUDENT' | 'MENTOR' | 'MEMBER';

async function asActor<T>(
  deps: FaqDeps,
  userId: string,
  role: Role,
  run: (tx: Tx, actor: Actor, now: Date) => Promise<T>,
): Promise<T> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR SHARE`;
    const permissions = createPermissions({
      db: () => tx,
      getSessionUserId: async () => userId,
      now: () => now,
    });
    const actor =
      role === 'MENTOR'
        ? await permissions.requireMentor()
        : await permissions.requireVerifiedMember(role === 'STUDENT' ? { roles: ['STUDENT'] } : {});
    await requireConsent(tx, userId);
    return run(tx, actor, now);
  });
}

/** Öğrencinin doğrulanmış etkin üyeliklerinden ilkinin bölümü (talebin yazıldığı an). */
function studentDepartment(actor: Actor): string {
  const membership = actor.facts.memberships.find(
    (m) => m.role === 'STUDENT' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
  );
  if (!membership) throw errorForDenyReason('FORBIDDEN');
  return membership.departmentId;
}

/** Yazılan soruya benzer yayınlanmış SSS'ler (en çok 5). Hız sınırlı: saatte 60. */
export async function suggestSimilarFaqs(
  deps: FaqDeps,
  userId: string,
  input: SuggestSimilarFaqsInput,
): Promise<FaqSuggestion[]> {
  const parsed = suggestSimilarFaqsSchema.parse(input);
  return asActor(deps, userId, 'STUDENT', async (tx, actor, now) => {
    await consumeRateLimit(tx, RATE_LIMITS.faqSuggest, userId, now);
    const rows = await similarFaqRows(tx, {
      universityIds: await viewerUniversityIds(tx, actor),
      text: parsed.text,
      limit: FAQ_SIMILAR_LIMIT,
    });
    return faqSuggestionsSchema.parse(rows);
  });
}

/**
 * SSS talebi gönderir. Sıra: yetki → kişisel veri biçimi → hız sınırı (günde 3) → benzer SSS kapısı (`FAQ_SIMILAR_EXISTS`,
 * kullanıcı önerileri gördüğünü onaylamadıkça) → kayıt. Sayaç yalnız kayıt başarılıysa artar (reddedilen deneme düşer).
 */
export async function submitFaqRequest(
  deps: FaqDeps,
  userId: string,
  input: SubmitFaqRequestInput,
): Promise<SubmitFaqRequestOutput> {
  const parsed = submitFaqRequestSchema.parse(input);
  let subject: ReturnType<typeof subjectFromActor> = null;
  const result = await asActor(deps, userId, 'STUDENT', async (tx, actor, now) => {
    const departmentId = studentDepartment(actor);
    if (hasPersonalDataPattern(parsed.question)) throw codedValidation('FAQ_TEXT_PERSONAL_DATA');
    await consumeRateLimit(tx, RATE_LIMITS.faqRequest, userId, now);
    if (!parsed.similarAcknowledged) {
      const similar = await similarFaqRows(tx, {
        universityIds: await viewerUniversityIds(tx, actor),
        text: parsed.question,
        limit: FAQ_SIMILAR_LIMIT,
      });
      if (similar.length > 0) throw codedConflict('FAQ_SIMILAR_EXISTS');
    }
    const row = await tx.faqRequest.create({
      data: { askerId: userId, departmentIdAtWrite: departmentId, question: parsed.question },
      select: { id: true },
    });
    subject = subjectFromActor(actor);
    return { requestId: row.id };
  });
  // Kullanım olayı (P1-13): kişisel veri yok (props boş); işlem bittikten sonra.
  emitEvent(deps.db, userId, { type: 'FAQ_REQUESTED', props: {} }, subject);
  return result;
}

/** Kullanıcının kendi talepleri (yeniden eskiye). */
export async function listMyFaqRequests(
  deps: FaqDeps,
  userId: string,
  input: ListMyFaqRequestsInput,
): Promise<MyFaqRequestPage> {
  const parsed = listMyFaqRequestsSchema.parse(input);
  return asActor(deps, userId, 'STUDENT', async (tx) => {
    const rows = await tx.faqRequest.findMany({
      where: { askerId: userId, ...idCursorWhere(parsed.cursor) },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
      select: {
        id: true,
        question: true,
        status: true,
        createdAt: true,
        decidedAt: true,
        decisionNote: true,
        item: { select: { id: true } },
      },
    });
    const page = toPage(rows, parsed.limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        question: row.question,
        status: row.status,
        createdAt: row.createdAt,
        decidedAt: row.decidedAt,
        decisionNote: row.decisionNote,
        faqItemId: row.item?.id ?? null,
        directoryHref: row.status === 'REDIRECTED' ? FAQ_MENTOR_DIRECTORY_HREF : null,
      })),
      nextCursor: page.nextCursor,
    };
  });
}

/** Mentorun görebileceği açık talepler: aynı üniversite (K-07), kendi talebi hariç; soran kimliği yok. */
export async function listFaqRequestsForMentor(
  deps: FaqDeps,
  mentorId: string,
  input: ListFaqRequestsForMentorInput,
): Promise<MentorFaqRequestPage> {
  const parsed = listFaqRequestsForMentorSchema.parse(input);
  return asActor(deps, mentorId, 'MENTOR', async (tx, actor) => {
    const universityIds = await viewerUniversityIds(tx, actor);
    const rows = await tx.faqRequest.findMany({
      where: {
        status: 'OPEN',
        askerId: { not: mentorId },
        department: { faculty: { universityId: { in: universityIds } } },
        ...(parsed.onlyUnanswered ? { answers: { none: { mentorId } } } : {}),
        ...idCursorWhere(parsed.cursor),
      },
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
      select: {
        id: true,
        question: true,
        createdAt: true,
        answers: {
          where: { mentorId },
          select: { id: true, body: true, updatedAt: true },
        },
      },
    });
    const page = toPage(rows, parsed.limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        question: row.question,
        createdAt: row.createdAt,
        myAnswer: row.answers[0] ?? null,
      })),
      nextCursor: page.nextCursor,
    };
  });
}

/** Cevap yazar ya da (talep açıkken) kendi cevabını günceller. Kapsam dışı talep `RESOURCE_NOT_FOUND`. */
export async function answerFaqRequest(
  deps: FaqDeps,
  mentorId: string,
  input: AnswerFaqRequestInput,
): Promise<AnswerFaqRequestOutput> {
  const parsed = answerFaqRequestSchema.parse(input);
  return asActor(deps, mentorId, 'MENTOR', async (tx, actor) => {
    await tx.$queryRaw`SELECT "id" FROM "FaqRequest" WHERE "id"=${parsed.requestId} FOR UPDATE`;
    const request = await tx.faqRequest.findUnique({
      where: { id: parsed.requestId },
      select: { status: true, askerId: true, department: { select: { faculty: true } } },
    });
    const universityIds = await viewerUniversityIds(tx, actor);
    if (!request || !universityIds.includes(request.department.faculty.universityId))
      throw codedNotFound('RESOURCE_NOT_FOUND');
    if (request.askerId === mentorId) throw codedForbidden('FAQ_OWN_REQUEST');
    if (request.status !== 'OPEN') throw codedConflict('FAQ_REQUEST_CLOSED');
    if (hasPersonalDataPattern(parsed.body)) throw codedValidation('FAQ_TEXT_PERSONAL_DATA');
    const answer = await tx.faqAnswer.upsert({
      where: { requestId_mentorId: { requestId: parsed.requestId, mentorId } },
      create: { requestId: parsed.requestId, mentorId, body: parsed.body },
      update: { body: parsed.body },
      select: { id: true },
    });
    return { answerId: answer.id };
  });
}

/** Yayınlanmış SSS sayfası/araması: yalnız arayanın üniversitesindeki bölümlerde yazılmış talepler (K-07). */
export async function searchFaq(
  deps: FaqDeps,
  userId: string,
  input: SearchFaqInput,
): Promise<FaqSearchPage> {
  const parsed = searchFaqSchema.parse(input);
  const universityIds = await asActor(deps, userId, 'MEMBER', (tx, actor) =>
    viewerUniversityIds(tx, actor),
  );
  const { rows, total } = await searchFaqRows(deps.db, {
    universityIds,
    q: parsed.q,
    page: parsed.page,
    pageSize: parsed.pageSize,
  });
  return { items: rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getFaqItem(
  deps: FaqDeps,
  userId: string,
  input: GetFaqItemInput,
): Promise<FaqItemView> {
  const parsed = getFaqItemSchema.parse(input);
  return asActor(deps, userId, 'MEMBER', async (tx, actor) => {
    const row = await findFaqRow(tx, await viewerUniversityIds(tx, actor), parsed.id);
    if (!row) throw codedNotFound('RESOURCE_NOT_FOUND');
    return row;
  });
}

import 'server-only';

import {
  JOB_POSTING_CONTACT_NOT_REQUESTABLE,
  jobPostingContactPreviewSchema,
  previewJobPostingContactSchema,
  requestJobPostingContactOutputSchema,
  requestJobPostingContactSchema,
  type JobPostingContactPreview,
  type PreviewJobPostingContactInput,
  type RequestJobPostingContactInput,
  type RequestJobPostingContactOutput,
} from '@/contracts/job-postings';
import { CONTACT_MESSAGE_MAX } from '@/contracts/contact-request';
import { codedNotFound, codedValidation } from '@/lib/errors';

import { requestableFieldsOf, sendContactRequest } from './contactRequest';
import { resolveContactAuthor, type JobPostingDeps } from './job-postings';
import { RATE_LIMITS, consumeRateLimit } from './rateLimit';

/**
 * İlan üzerinden iletişim talebi (D7; docs/faz2-plan.md P2-04). Okuyucu YAZAR kimliğini hiçbir aşamada görmez: girdi ilan
 * kimliğidir, sunucu yazarı ilandan çözer ve MEVCUT iletişim talebi akışını (`ContactRequest` kaydı, bildirim, olay, hız sınırı)
 * kullanır. Önizleme ad değil ilan başlığı/kurum gösterir; yazarın adı yalnız talep onaylanınca açılır (mevcut D7 akışı).
 */

const nowOf = (deps: JobPostingDeps) => (deps.now ?? (() => new Date()))();
const CONTEXT_TITLE_MAX = 80;

/** Talepteki not: ilan bağlamı + (varsa) kullanıcının notu; en çok `CONTACT_MESSAGE_MAX` karakter (kullanıcı notu kısalır). */
export function contactNoteFor(title: string, message: string | null | undefined): string {
  const context = `İlan: ${title.length > CONTEXT_TITLE_MAX ? `${title.slice(0, CONTEXT_TITLE_MAX)}…` : title}`;
  const user = message?.trim();
  if (!user) return context;
  const room = CONTACT_MESSAGE_MAX - context.length - 3;
  return room <= 0 ? context : `${context} — ${user.slice(0, room)}`;
}

/**
 * Önizleme. Talep edilemeyen her durum (ilan yok/kapsam dışı/açık değil/iletişim yöntemi değil, kendi ilanı, yazar askıda ya da
 * silinmiş, açık alan yok) TEK genel yanıta düşer. Hız sınırı önce: ilan kimliği taraması yavaşlar.
 */
export async function previewJobPostingContact(
  deps: JobPostingDeps,
  userId: string,
  input: PreviewJobPostingContactInput,
): Promise<JobPostingContactPreview> {
  const parsed = previewJobPostingContactSchema.parse(input);
  await consumeRateLimit(deps.db, RATE_LIMITS.contactPreview, userId, nowOf(deps));
  const target = await resolveContactAuthor(deps, userId, parsed.jobPostingId);
  // Olumsuz durumlarda da aynı sorgu akışını uygula (süre farkı kaba azaltılır; sabit süre garantisi değildir).
  const fields = await requestableFieldsOf(deps.db, target?.authorId ?? userId);
  if (!target || target.authorId === userId || fields.length === 0)
    return JOB_POSTING_CONTACT_NOT_REQUESTABLE;
  return jobPostingContactPreviewSchema.parse({
    canRequest: true,
    postingTitle: target.title,
    organizationName: target.organizationName,
    requestableFields: fields,
  });
}

/** İlanın yazarına iletişim talebi gönderir; yazarın adı/kimliği çıktıda yoktur. */
export async function requestJobPostingContact(
  deps: JobPostingDeps,
  userId: string,
  input: RequestJobPostingContactInput,
): Promise<RequestJobPostingContactOutput> {
  const parsed = requestJobPostingContactSchema.parse(input);
  const target = await resolveContactAuthor(deps, userId, parsed.jobPostingId);
  if (!target) throw codedNotFound('RESOURCE_NOT_FOUND');
  if (target.authorId === userId) throw codedValidation('CONTACT_REQUEST_SELF');
  const sent = await sendContactRequest(
    deps.db,
    userId,
    {
      targetUserId: target.authorId,
      fields: parsed.fields,
      message: contactNoteFor(target.title, parsed.message),
    },
    nowOf(deps),
  );
  return requestJobPostingContactOutputSchema.parse({
    requestId: sent.requestId,
    status: 'PENDING',
  });
}

import 'server-only';
import { notificationCopy as t } from '../jobs/notification-copy';
import { getEnv } from '@/lib/env';
import { getDb } from '../db';
import { enqueueEmail } from '../jobs/email';

type Event =
  | 'moderationApproved'
  | 'moderationRejected'
  | 'contact'
  | 'invitation'
  | 'freshness'
  | 'migration'
  | 'faqPublished'
  | 'faqRejected'
  | 'faqRedirected'
  | 'faqAnswerPublished'
  | 'jobPostingPublished'
  | 'jobPostingRejected'
  | 'jobPostingExpired'
  | 'referralUpdated';
const templates = {
  moderationApproved: 'experience.moderation-approved',
  moderationRejected: 'experience.moderation-rejected',
  contact: 'contact.requested',
  invitation: 'cv.invitation',
  freshness: 'profile.freshness',
  migration: 'student.email-migration',
  faqPublished: 'faq.published',
  faqRejected: 'faq.rejected',
  faqRedirected: 'faq.redirected',
  faqAnswerPublished: 'faq.answerPublished',
  jobPostingPublished: 'jobPosting.published',
  jobPostingRejected: 'jobPosting.rejected',
  jobPostingExpired: 'jobPosting.expired',
  referralUpdated: 'referral.updated',
} as const satisfies Record<Event, string>;

/** Kişisel içerik günlüklenmez; idempotency anahtarı olayın sabit kimliğidir. */
export async function sendNotification(input: {
  userId: string;
  event: Event;
  eventId: string;
  path: string;
}) {
  const user = await getDb().user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  });
  if (!user) return null;
  const url = new URL(input.path, getEnv().APP_URL);
  if (url.origin !== new URL(getEnv().APP_URL).origin) throw new Error('NOTIFICATION_PATH_INVALID');
  const result = await enqueueEmail({
    to: user.email,
    recipientUserId: input.userId,
    template: templates[input.event],
    idempotencyKey: `${templates[input.event]}:${input.eventId}`,
    subject: t(`${input.event}Subject`),
    text: t(`${input.event}Text`, { url: url.href }),
  });
  return result.emailLogId;
}

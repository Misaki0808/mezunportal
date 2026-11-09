import 'server-only';
import messages from '../../../messages/tr.json';
import { digestUnsubscribeToken } from '../rules/digest-unsubscribe';
import type { buildMonthlyDigest } from './monthly-digest';

type Digest = NonNullable<Awaited<ReturnType<typeof buildMonthlyDigest>>>;

/** E-posta ve uygulama görünümü aynı seçilmiş özet verisini kullanır. */
export function monthlyDigestEmail(digest: Digest, userId: string, secret: string, appUrl: string) {
  const t = messages.monthlyDigest;
  const parts = [t.intro];
  if (digest.experiences)
    parts.push(
      `${t.experiences}\n${digest.experiences.map((item) => `• ${item.label}`).join('\n')}`,
    );
  if (digest.jobs)
    parts.push(
      `${t.jobs}\n${digest.jobs.map((item) => `• ${item.title} — ${item.organization}`).join('\n')}`,
    );
  if (digest.contribution)
    parts.push(
      `${t.contribution}\n${t.earned.replace('{points}', String(digest.contribution.earned))}\n${t.pending.replace('{points}', String(digest.contribution.pending))}`,
    );
  if (digest.applicationWindows)
    parts.push(
      `${t.windows}\n${digest.applicationWindows.map((item) => `• ${item.label}`).join('\n')}`,
    );
  if (digest.events)
    parts.push(`${t.events}\n${digest.events.map((item) => `• ${item.label}`).join('\n')}`);
  const unsubscribe = new URL('/aylik-ozet/abonelikten-cik', appUrl);
  unsubscribe.hash = new URLSearchParams({
    token: digestUnsubscribeToken(userId, secret),
  }).toString();
  parts.push(t.open.replace('{url}', new URL('/hesap/aylik-ozet', appUrl).href));
  parts.push(t.unsubscribe.replace('{url}', unsubscribe.href));
  return { subject: t.subject, text: parts.join('\n\n') };
}

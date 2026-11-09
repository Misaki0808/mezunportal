import { createHmac, timingSafeEqual } from 'node:crypto';

function signature(subject: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`monthly-digest:unsubscribe:v1:${subject}`)
    .digest('base64url');
}

/** Bağlantı yalnız imzadaki hesap ve aylık özet tercihi için geçerlidir. */
export function digestUnsubscribeToken(userId: string, secret: string): string {
  const subject = Buffer.from(userId, 'utf8').toString('base64url');
  return `${subject}.${signature(subject, secret)}`;
}

/** Tekrarlanabilir; farklı hesap, bozuk veya değiştirilmiş belirteç kabul edilmez. */
export function digestUnsubscribeSubject(token: string, secret: string): string | null {
  if (token.length > 320 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [subject, mac] = token.split('.') as [string, string];
  const expected = Buffer.from(signature(subject, secret));
  const actual = Buffer.from(mac);
  if (!timingSafeEqual(expected, actual)) return null;
  const userId = Buffer.from(subject, 'base64url').toString('utf8');
  if (!userId || userId.length > 200 || Buffer.from(userId).toString('base64url') !== subject)
    return null;
  return userId;
}

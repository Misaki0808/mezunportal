import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { codedRateLimited } from '@/lib/errors';

/**
 * Sabit pencereli hız sınırı, Better Auth'un `RateLimit` tablosunda (süreçler arası ve yeniden başlatmada
 * korunur). Uygulama anahtarları `app:` önekiyle Better Auth anahtarlarından ayrılır. Tek atomik SQL:
 * pencere geçtiyse sayaç 1'e döner, değilse artar.
 */
export type RateLimitRule = {
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
};

export const RATE_LIMITS = {
  bulkInvitation: { name: 'bulk-invitation', limit: 5, windowMs: 24 * 60 * 60 * 1000 },
  /** İletişim talebi: kullanıcı başına günde 10. */
  contactRequest: { name: 'contact-request', limit: 10, windowMs: 24 * 60 * 60 * 1000 },
  /** Veri dökümü: kullanıcı başına saatte 5. */
  dataExport: { name: 'data-export', limit: 5, windowMs: 60 * 60 * 1000 },
  /** Hesap silme denemesi (e-posta onayı yanlış yazılabilir): saatte 5. */
  accountDeletion: { name: 'account-deletion', limit: 5, windowMs: 60 * 60 * 1000 },
  /** İletişim hedefi önizlemesi: kullanıcı kimliklerini taramayı yavaşlatır; saatte 60. */
  contactPreview: { name: 'contact-preview', limit: 60, windowMs: 60 * 60 * 1000 },
  /** SSS talebi (P1-17): kullanıcı başına günde 3. */
  faqRequest: { name: 'faq-request', limit: 3, windowMs: 24 * 60 * 60 * 1000 },
  /** SSS benzer soru önerisi (yazarken): kullanıcı başına saatte 60. */
  faqSuggest: { name: 'faq-suggest', limit: 60, windowMs: 60 * 60 * 1000 },
  /** İlan gönderimi (P2-04): yazar başına 30 günde 5. */
  jobPostingSubmit: { name: 'job-posting-submit', limit: 5, windowMs: 30 * 24 * 60 * 60 * 1000 },
  /** Aday arama (P2-06): mezun başına günde 50 aday kartı (sayaç dönen kart sayısı kadar artar). */
  seekerCards: { name: 'seeker-cards', limit: 50, windowMs: 24 * 60 * 60 * 1000 },
  /** Aday kartı üzerinden iletişim talebi (P2-06): mezun başına 30 günde 20. */
  seekerContact: { name: 'seeker-contact', limit: 20, windowMs: 30 * 24 * 60 * 60 * 1000 },
  /** İlan şikâyeti (P2-04): kullanıcı başına günde 10. */
  jobPostingReport: { name: 'job-posting-report', limit: 10, windowMs: 24 * 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** Sayaç artırır; sınır aşıldıysa `RATE_LIMITED` fırlatır. Anahtara kişisel veri değil kullanıcı kimliği girer. */
export async function consumeRateLimit(
  db: RateLimitClient,
  rule: RateLimitRule,
  subjectId: string,
  now: Date = new Date(),
): Promise<void> {
  await consumeRateLimitBy(db, rule, subjectId, 1, now);
}

/**
 * Sayacı `cost` kadar artırır (ör. bir yanıtta dönen kart sayısı); sınır aşılırsa `RATE_LIMITED` (artış geri alınmaz: çağıran işlemi
 * geri sarar). `cost` 1..`rule.limit` aralığında tam sayıdır.
 */
export async function consumeRateLimitBy(
  db: RateLimitClient,
  rule: RateLimitRule,
  subjectId: string,
  cost: number,
  now: Date = new Date(),
): Promise<void> {
  if (!Number.isInteger(cost) || cost < 1 || cost > rule.limit)
    throw new RangeError('invalid cost');
  const key = `app:${rule.name}:${subjectId}`;
  const nowMs = BigInt(now.getTime());
  const windowStart = nowMs - BigInt(rule.windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (gen_random_uuid()::text, ${key}, ${cost}, ${nowMs})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."lastRequest" < ${windowStart} THEN ${cost} ELSE "RateLimit"."count" + ${cost} END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" < ${windowStart} THEN ${nowMs} ELSE "RateLimit"."lastRequest" END
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  if (count > rule.limit) throw codedRateLimited('RATE_LIMITED');
}

/** Sayacı ARTIRMADAN kalan hakkı okur (ekran "bugün kaç hakkın kaldı" göstersin diye). */
export async function peekRateLimit(
  db: RateLimitClient,
  rule: RateLimitRule,
  subjectId: string,
  now: Date = new Date(),
): Promise<{ used: number; remaining: number }> {
  const key = `app:${rule.name}:${subjectId}`;
  const windowStart = BigInt(now.getTime()) - BigInt(rule.windowMs);
  const rows = await db.$queryRaw<{ count: number; lastRequest: bigint }[]>`
    SELECT "count", "lastRequest" FROM "RateLimit" WHERE "key" = ${key}`;
  const row = rows[0];
  const used = row && row.lastRequest >= windowStart ? Number(row.count) : 0;
  return { used, remaining: Math.max(0, rule.limit - used) };
}

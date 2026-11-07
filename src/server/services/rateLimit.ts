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
  /** İletişim talebi: kullanıcı başına günde 10. */
  contactRequest: { name: 'contact-request', limit: 10, windowMs: 24 * 60 * 60 * 1000 },
  /** Veri dökümü: kullanıcı başına saatte 5. */
  dataExport: { name: 'data-export', limit: 5, windowMs: 60 * 60 * 1000 },
  /** Hesap silme denemesi (e-posta onayı yanlış yazılabilir): saatte 5. */
  accountDeletion: { name: 'account-deletion', limit: 5, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** Sayaç artırır; sınır aşıldıysa `RATE_LIMITED` fırlatır. Anahtara kişisel veri değil kullanıcı kimliği girer. */
export async function consumeRateLimit(
  db: RateLimitClient,
  rule: RateLimitRule,
  subjectId: string,
  now: Date = new Date(),
): Promise<void> {
  const key = `app:${rule.name}:${subjectId}`;
  const nowMs = BigInt(now.getTime());
  const windowStart = nowMs - BigInt(rule.windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (gen_random_uuid()::text, ${key}, 1, ${nowMs})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."lastRequest" < ${windowStart} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" < ${windowStart} THEN ${nowMs} ELSE "RateLimit"."lastRequest" END
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  if (count > rule.limit) throw codedRateLimited('RATE_LIMITED');
}

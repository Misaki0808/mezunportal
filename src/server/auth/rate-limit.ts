import 'server-only';

import { createHmac } from 'node:crypto';

import type { Prisma } from '@/generated/prisma/client';

import type { RateLimitRule } from './limits';

export type RateLimitClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

export type RateLimitResult = {
  allowed: boolean;
  /** Pencere dolana kadar kalan saniye (izin verildiyse de pencerenin kalanı). */
  retryAfterSeconds: number;
};

/**
 * Anahtar: `app:<alan>:<HMAC(sır, değer)>`. Ham e-posta/kullanıcı kimliği/adres tabloya YAZILMAZ; sır
 * olmadan geri çözülemez. `app:` öneki Better Auth'un kendi satırlarından (yol/IP anahtarları) ayırır.
 */
export function rateLimitKey(scope: string, value: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(`${scope}\u0000${value}`).digest('hex');
  return `app:${scope}:${digest}`;
}

/**
 * Sabit pencereli, veritabanı destekli sayaç. TEK atomik `INSERT … ON CONFLICT DO UPDATE` ile sayar:
 * eşzamanlı çağrılar sırayla artar, sınır aşılamaz. `lastRequest` bu satırda PENCERE BAŞLANGICIDIR.
 * Sayaç `max + 1`'de doyar (sınırsız büyümez).
 */
export async function consumeRateLimit(
  db: RateLimitClient,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const nowMs = BigInt(now.getTime());
  const windowMs = BigInt(rule.windowSeconds * 1000);
  const expiredBefore = nowMs - windowMs;
  const cap = rule.max + 1;

  const rows = await db.$queryRaw<{ count: number; windowStart: bigint }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (gen_random_uuid()::text, ${key}, 1, ${nowMs})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."lastRequest" <= ${expiredBefore}
                     THEN 1 ELSE LEAST("RateLimit"."count" + 1, ${cap}::int) END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" <= ${expiredBefore}
                           THEN ${nowMs} ELSE "RateLimit"."lastRequest" END
    RETURNING "count", "lastRequest" AS "windowStart"`;

  const row = rows[0];
  if (!row) throw new Error('Hız sınırı sayacı güncellenemedi');
  const remainingMs = Number(row.windowStart + windowMs - nowMs);
  return {
    allowed: row.count <= rule.max,
    retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
  };
}

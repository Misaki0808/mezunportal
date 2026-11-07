import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { unique } from '@/test/fixtures';

import { consumeRateLimit, rateLimitKey } from './rate-limit';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const RULE = { max: 3, windowSeconds: 60 } as const;
const T0 = new Date('2026-11-08T10:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe('rateLimitKey', () => {
  it('ham değeri içermez, deterministiktir, kapsam ve sırra göre ayrışır', () => {
    const key = rateLimitKey('magic-link:email', 'ayse@ogr.iu.edu.tr', 'sir-bir');
    expect(key).toMatch(/^app:magic-link:email:[0-9a-f]{64}$/);
    expect(key).not.toContain('ayse');
    expect(key).not.toContain('@');
    expect(rateLimitKey('magic-link:email', 'ayse@ogr.iu.edu.tr', 'sir-bir')).toBe(key);
    expect(rateLimitKey('magic-link:ip', 'ayse@ogr.iu.edu.tr', 'sir-bir')).not.toBe(key);
    expect(rateLimitKey('magic-link:email', 'ayse@ogr.iu.edu.tr', 'sir-iki')).not.toBe(key);
    expect(rateLimitKey('magic-link:email', 'baska@ogr.iu.edu.tr', 'sir-bir')).not.toBe(key);
  });
});

describe('consumeRateLimit (sabit pencere, veritabanı destekli)', () => {
  it('sınıra kadar izin verir, aşınca reddeder ve kalan süreyi bildirir', async () => {
    const key = unique('app:test:sinir');
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await consumeRateLimit(prisma, key, RULE, at(i)));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    // Pencere T0'da başladı (60 sn): 4. istek 3. saniyede → 57 sn kaldı.
    expect(results[3]?.retryAfterSeconds).toBe(57);
  });

  it('pencere dolunca sayaç sıfırlanır', async () => {
    const key = unique('app:test:pencere');
    for (let i = 0; i < 4; i += 1) await consumeRateLimit(prisma, key, RULE, at(i));
    expect((await consumeRateLimit(prisma, key, RULE, at(30))).allowed).toBe(false);

    const afterWindow = await consumeRateLimit(prisma, key, RULE, at(61));

    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.retryAfterSeconds).toBe(60);
  });

  it('anahtarlar birbirinden bağımsızdır', async () => {
    const a = unique('app:test:a');
    const b = unique('app:test:b');
    for (let i = 0; i < 4; i += 1) await consumeRateLimit(prisma, a, RULE, at(i));
    expect((await consumeRateLimit(prisma, a, RULE, at(5))).allowed).toBe(false);
    expect((await consumeRateLimit(prisma, b, RULE, at(5))).allowed).toBe(true);
  });

  it('EŞZAMANLI çağrılarda sınır aşılamaz: 20 paralel istekten tam max kadarı geçer', async () => {
    const key = unique('app:test:paralel');
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeRateLimit(prisma, key, { max: 5, windowSeconds: 60 }, T0),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.filter((r) => !r.allowed)).toHaveLength(15);
  });

  it('sayaç max + 1’de doyar (sınırsız büyümez)', async () => {
    const key = unique('app:test:doygun');
    for (let i = 0; i < 12; i += 1) await consumeRateLimit(prisma, key, RULE, at(i));
    const row = await prisma.rateLimit.findUniqueOrThrow({ where: { key } });
    expect(row.count).toBe(RULE.max + 1);
  });
});

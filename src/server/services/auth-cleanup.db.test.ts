import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';
import { AUTH_LIMITS } from '@/server/auth/limits';
import { EMPLOYMENT_EXPORT_RATE_LIMIT } from '@/contracts/admin';
import { APPOINTMENT_REQUEST_RATE_LIMIT } from '@/contracts/appointment';
import { EXPERIENCE_REPORT_RATE_LIMIT } from '@/contracts/experience';
import { JOB_POSTING_REPORT_RATE_LIMIT } from '@/contracts/job-postings';
import { USAGE_EXPORT_RATE_LIMIT } from '@/contracts/metrics';
import { RATE_LIMITS } from './rateLimit';
import { purgeExpiredAuth, RATE_LIMIT_RETENTION_MS } from './auth-cleanup';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
describe('süresi dolmuş oturum ve doğrulamaları temizleme', () => {
  it('sayfalayarak yalnız kesim anından önce dolanları siler ve tekrar idempotenttir', async () => {
    const now = new Date('2035-01-01T00:00:00Z');
    const userId = await createUser(db);
    const times = [-3, -2, -1, 0, 1].map((offset) => new Date(now.getTime() + offset));
    const sessions = await Promise.all(
      times.map((expiresAt) =>
        db.session.create({ data: { userId, expiresAt, token: randomUUID() } }),
      ),
    );
    const verifications = await Promise.all(
      times.map((expiresAt) =>
        db.verification.create({
          data: { identifier: randomUUID(), value: randomUUID(), expiresAt },
        }),
      ),
    );
    const result = await purgeExpiredAuth(db, now, 2);
    expect(result.sessions).toBeGreaterThanOrEqual(3);
    expect(result.verifications).toBeGreaterThanOrEqual(3);
    expect(await db.session.count({ where: { id: { in: sessions.map((row) => row.id) } } })).toBe(
      2,
    );
    expect(
      await db.verification.count({ where: { id: { in: verifications.map((row) => row.id) } } }),
    ).toBe(2);
    expect(await purgeExpiredAuth(db, now, 2)).toEqual({
      sessions: 0,
      verifications: 0,
      rateLimits: 0,
    });
  });
  it('silme öncesi süresi uzatılan oturumu korur', async () => {
    const now = new Date('2035-01-01T00:00:00Z');
    const session = await db.session.create({
      data: {
        userId: await createUser(db),
        token: randomUUID(),
        expiresAt: new Date(now.getTime() - 1),
      },
    });
    const original = db.session.deleteMany.bind(db.session);
    const simulateExtension = async (args: Parameters<typeof db.session.deleteMany>[0]) => {
      await db.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(now.getTime() + 10000) },
      });
      return original(args);
    };
    const spy = vi
      .spyOn(db.session, 'deleteMany')
      .mockImplementationOnce(simulateExtension as unknown as typeof db.session.deleteMany);
    try {
      await purgeExpiredAuth(db, now, 1);
    } finally {
      spy.mockRestore();
    }
    expect(await db.session.findUnique({ where: { id: session.id } })).not.toBeNull();
  });
});

describe('süresi dolmuş hız sınırı satırlarını temizleme (kart 533)', () => {
  const now = new Date('2035-01-01T00:00:00Z');
  const make = (label: string, ageMs: number, count = 3) =>
    db.rateLimit.create({
      data: {
        key: `app:r1-test:${label}:${randomUUID()}`,
        count,
        lastRequest: BigInt(now.getTime() - ageMs),
      },
    });

  it('pencereden eski satırı siler, güncel ve pencere içindeki satırı korur (sayaç doymuşsa da)', async () => {
    const old = await make('eski', RATE_LIMIT_RETENTION_MS + 1000);
    const edge = await make('sinir', RATE_LIMIT_RETENTION_MS - 1000);
    const fresh = await make('guncel', 1000, 6); // sınır aşılmış, pencere içinde: silinirse sınır gevşer
    const ids = [old.id, edge.id, fresh.id];
    const result = await purgeExpiredAuth(db, now, 2);
    expect(result.rateLimits).toBeGreaterThanOrEqual(1);
    const left = await db.rateLimit.findMany({
      where: { id: { in: ids } },
      select: { id: true, count: true },
    });
    expect(left.map((row) => row.id).sort()).toEqual([edge.id, fresh.id].sort());
    expect(left.find((row) => row.id === fresh.id)?.count).toBe(6);
    expect((await purgeExpiredAuth(db, now, 2)).rateLimits).toBe(0);
  });

  it('Better Auth satırlarını da (yol/IP anahtarı) pencere sonrası siler', async () => {
    const row = await db.rateLimit.create({
      data: {
        key: `203.0.113.${Math.floor(Math.random() * 200)}|/magic-link/verify|${randomUUID()}`,
        count: 1,
        lastRequest: BigInt(now.getTime() - RATE_LIMIT_RETENTION_MS - 5),
      },
    });
    await purgeExpiredAuth(db, now, 2);
    expect(await db.rateLimit.count({ where: { id: row.id } })).toBe(0);
  });

  it('saklama süresi bilinen en uzun hız sınırı penceresinden uzundur (yeni uzun pencere eklenirse bu test kırılır)', () => {
    const windows = [
      ...Object.values(RATE_LIMITS).map((rule) => rule.windowMs),
      ...Object.values(AUTH_LIMITS).map((rule) => rule.windowSeconds * 1000),
      ...[
        EMPLOYMENT_EXPORT_RATE_LIMIT,
        APPOINTMENT_REQUEST_RATE_LIMIT,
        EXPERIENCE_REPORT_RATE_LIMIT,
        JOB_POSTING_REPORT_RATE_LIMIT,
        USAGE_EXPORT_RATE_LIMIT,
      ].map((rule) => rule.windowSeconds * 1000),
    ];
    expect(Math.max(...windows)).toBe(30 * 24 * 60 * 60 * 1000);
    expect(RATE_LIMIT_RETENTION_MS).toBeGreaterThan(Math.max(...windows));
  });
});

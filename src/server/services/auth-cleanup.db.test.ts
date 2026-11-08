import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';
import { purgeExpiredAuth } from './auth-cleanup';

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
    expect(await purgeExpiredAuth(db, now, 2)).toEqual({ sessions: 0, verifications: 0 });
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

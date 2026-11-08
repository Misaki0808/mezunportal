import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { addGrant, addMembership, createInstitution, createUser } from '@/test/fixtures';
import { createTestPrisma } from '@/test/db';
import { grantAdmin, revokeAdmin, suspendUser } from './admin-users';
import { deleteAccount } from './accountDeletion';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
async function people() {
  const institution = await createInstitution(db);
  const user = async () => {
    const id = await createUser(db);
    await addMembership(db, {
      userId: id,
      departmentId: institution.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    return id;
  };
  const a = await user(),
    b = await user(),
    target = await user();
  const grantA = await addGrant(db, { userId: a, scope: 'SYSTEM' }),
    grantB = await addGrant(db, { userId: b, scope: 'SYSTEM' });
  return { a, b, target, grantA, grantB };
}
/** İşlem içindeki bekleme noktası; gerçek PostgreSQL ve transaction aynen kullanılır. */
function pausedClient(hooks: {
  raw?: (parts: TemplateStringsArray, values: unknown[]) => Promise<void>;
  grantCreate?: () => Promise<void>;
}): PrismaClient {
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== '$transaction') return Reflect.get(target, property, receiver);
      return <T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: { timeout?: number; maxWait?: number },
      ) =>
        db.$transaction(
          (tx) =>
            fn(
              new Proxy(tx, {
                get(object, key, proxy) {
                  if (key === '$queryRaw')
                    return async (parts: TemplateStringsArray, ...values: unknown[]) => {
                      await hooks.raw?.(parts, values);
                      return object.$queryRaw(parts, ...values);
                    };
                  if (key === 'adminGrant')
                    return new Proxy(object.adminGrant, {
                      get(delegate, method, delegated) {
                        if (method !== 'create') return Reflect.get(delegate, method, delegated);
                        return async (...args: unknown[]) => {
                          await hooks.grantCreate?.();
                          return Reflect.apply(
                            Reflect.get(delegate, method, delegate),
                            delegate,
                            args,
                          );
                        };
                      },
                    });
                  return Reflect.get(object, key, proxy);
                },
              }),
            ),
          options,
        );
    },
  });
}
const shortPause = () => new Promise<void>((resolve) => setTimeout(resolve, 80));
it('bekleyen yönetici yazımı yetki iptaliyle aynı sırayı korur', async () => {
  const p = await people(),
    entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>();
  const events: string[] = [];
  let once = false;
  const paused = pausedClient({
    raw: async (parts, values) => {
      if (!once && parts.join(' ').includes('FROM "User"') && values.includes(p.target)) {
        once = true;
        entered.resolve();
        await resume.promise;
      }
    },
  });
  const operation = suspendUser({ db: paused }, p.b, {
    userId: p.target,
    reason: 'Kural ihlali',
  }).then(
    (value) => {
      events.push('write');
      return { value };
    },
    (error) => {
      events.push('rejected');
      return { error };
    },
  );
  await entered.promise;
  const revoke = revokeAdmin({ db }, p.a, { grantId: p.grantB, reason: 'Görev bitti' }).then(() => {
    events.push('revoke');
  });
  try {
    await Promise.race([revoke, shortPause()]);
  } finally {
    resume.resolve();
  }
  const [result] = await Promise.all([operation, revoke]);
  if ('value' in result) expect(events.indexOf('write')).toBeLessThan(events.indexOf('revoke'));
  else expect(result.error).toMatchObject({ code: 'AUTH_FORBIDDEN' });
});
it('hesap silmeyle yarışan atama silinmiş kullanıcıya etkin yönetici yetkisi bırakamaz', async () => {
  const p = await people(),
    entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>();
  const paused = pausedClient({
    grantCreate: async () => {
      entered.resolve();
      await resume.promise;
    },
  });
  const grant = grantAdmin({ db: paused }, p.a, {
    scope: 'DEPARTMENT',
    userId: p.target,
    departmentId: (await db.membership.findFirstOrThrow({ where: { userId: p.target } }))
      .departmentId,
  });
  await entered.promise;
  const user = await db.user.findUniqueOrThrow({ where: { id: p.target } });
  const deletion = deleteAccount(
    db,
    p.target,
    { publishedContent: 'DELETE', confirmEmail: user.email },
    { removeStoredFiles: null },
  );
  try {
    await Promise.race([deletion, shortPause()]);
  } finally {
    resume.resolve();
  }
  await Promise.all([grant, deletion]);
  expect((await db.user.findUniqueOrThrow({ where: { id: p.target } })).deletedAt).not.toBeNull();
  expect(await db.adminGrant.count({ where: { userId: p.target, revokedAt: null } })).toBe(0);
});
it.each([
  ['eksik', undefined],
  ['boş', '   '],
] as const)('erken gerekçe %s: ret bütün değişiklikleri geri alır', async (_case, reason) => {
  const p = await people();
  await db.session.create({
    data: { userId: p.target, token: randomUUID(), expiresAt: new Date(Date.now() + 60000) },
  });
  await expect(
    suspendUser({ db }, p.a, { userId: p.target, reason } as never),
  ).rejects.toMatchObject({ code: 'AUDIT_REASON_REQUIRED' });
  expect((await db.user.findUniqueOrThrow({ where: { id: p.target } })).banned).toBe(false);
  expect(await db.session.count({ where: { userId: p.target } })).toBe(1);
  expect(await db.adminAuditLog.count({ where: { targetId: p.target } })).toBe(0);
});

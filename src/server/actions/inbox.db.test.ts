import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createUser, grantRequiredConsents } from '@/test/fixtures';

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('../db', () => ({ getDb: () => db }));
vi.mock('../permissions/session', () => ({ getSessionUserId: async () => session.userId }));
const db = createTestPrisma();

import { getMyInbox, markAllInboxRead, markInboxRead } from './inbox';
import { GET as unreadCount } from '@/app/api/bildirimler/okunmamis/route';

let alice: string;
let bob: string;
beforeAll(async () => {
  [alice, bob] = [await createUser(db), await createUser(db)];
  await grantRequiredConsents(db, alice);
  await grantRequiredConsents(db, bob);
  for (const [userId, kind, count] of [
    [alice, 'contact', 2],
    [bob, 'jobMatchPosting', 3],
  ] as const)
    await db.inAppNotification.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        userId,
        kind,
        refId: `r${i}`,
        key: `${userId}:${kind}:${i}`,
        createdAt: new Date('2030-06-19T09:00:00Z'),
      })),
    });
});
afterAll(() => db.$disconnect());
beforeEach(() => {
  session.userId = alice;
});

describe('bildirim kutusu eylemleri: kimlik ve yetki', () => {
  it('oturumsuz çağrı hiçbir veri vermez ve hiçbir kaydı değiştirmez', async () => {
    session.userId = null;
    expect(await getMyInbox()).toMatchObject({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
    expect(await markInboxRead({ ids: ['x'] })).toMatchObject({
      ok: false,
      errorCode: 'AUTH_UNAUTHENTICATED',
    });
    expect(await markAllInboxRead()).toMatchObject({
      ok: false,
      errorCode: 'AUTH_UNAUTHENTICATED',
    });
    expect(
      await db.inAppNotification.count({
        where: { userId: { in: [alice, bob] }, readAt: { not: null } },
      }),
    ).toBe(0);
  });

  it('kullanıcı kimliği istemciden alınmaz: fazladan alan ya da başkasının kimliği reddedilir', async () => {
    expect(
      await getMyInbox({ userId: bob } as unknown as Parameters<typeof getMyInbox>[0]),
    ).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    expect(
      await markInboxRead({ ids: ['a'], userId: bob } as unknown as Parameters<
        typeof markInboxRead
      >[0]),
    ).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
  });

  it('giriş yapmış kullanıcı yalnız kendi kutusunu görür; başkasının kimliklerini işaretleyemez', async () => {
    const mine = await getMyInbox();
    expect(mine).toMatchObject({ ok: true, data: { unread: 2 } });
    if (!mine.ok) throw new Error('beklenmedik');
    expect(mine.data.groups.map((g) => [g.kind, g.count])).toEqual([['contact', 2]]);

    session.userId = bob;
    const bobs = await getMyInbox();
    if (!bobs.ok) throw new Error('beklenmedik');
    const bobIds = bobs.data.groups.flatMap((g) => g.ids);

    session.userId = alice;
    expect(await markInboxRead({ ids: bobIds })).toEqual({ ok: true, data: { marked: 0 } });
    session.userId = bob;
    expect(await getMyInbox()).toMatchObject({ ok: true, data: { unread: 3 } });
  });

  it('"hepsini okundu yap" yalnız oturum sahibini etkiler', async () => {
    session.userId = alice;
    expect(await markAllInboxRead()).toEqual({ ok: true, data: { marked: 2 } });
    expect(await getMyInbox()).toMatchObject({ ok: true, data: { unread: 0 } });
    session.userId = bob;
    expect(await getMyInbox()).toMatchObject({ ok: true, data: { unread: 3 } });
  });
});

describe('rozet sayısı rotası', () => {
  it('oturumsuz 401, oturumlu yalnız kendi okunmamış sayısı; önbelleğe alınmaz', async () => {
    session.userId = null;
    const anonymous = await unreadCount();
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('cache-control')).toContain('no-store');

    session.userId = bob;
    const response = await unreadCount();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unread: 3 });
    expect(response.headers.get('cache-control')).toMatch(/private.*no-store/);

    session.userId = alice;
    expect(await (await unreadCount()).json()).toEqual({ unread: 0 });
  });

  it('rıza vermemiş kullanıcı rozet verisini okuyamaz', async () => {
    const lonely = await createUser(db);
    session.userId = lonely;
    expect((await unreadCount()).status).toBe(401);
  });
});

it('zorunlu onayı olmayan hesabın rozet rotası iş verisi saymaz', async () => {
  const user = await createUser(db);
  await db.inAppNotification.create({
    data: { userId: user, kind: 'contact', refId: 'riza-oncesi', key: `riza-oncesi-${user}` },
  });
  session.userId = user;
  const response = await unreadCount();
  expect(response.status).toBe(401);
  expect(await getMyInbox()).toMatchObject({ ok: false, errorCode: 'CONSENT_REQUIRED' });
});

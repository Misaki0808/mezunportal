import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

import { INBOX_UNREAD_CAP } from '@/contracts/inbox';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

import { countMyUnread, listMyInbox, markAllInboxRead, markInboxRead } from './inbox';
import { stageNotification, stagePilotInvitation } from './notification-intent';

const db = createTestPrisma();
const deps = { db, now: () => new Date('2030-06-20T09:00:00Z') };
afterAll(() => db.$disconnect());

const stage = (userId: string, payload: Parameters<typeof stageNotification>[2]) =>
  db.$transaction((tx) => stageNotification(tx, userId, payload));
const contact = (eventId: string = randomUUID()) =>
  ({ type: 'generic', event: 'contact', eventId, path: '/hesap/iletisim' }) as const;
const kinds = async (userId: string) =>
  (await db.inAppNotification.findMany({ where: { userId }, select: { kind: true } }))
    .map((row) => row.kind)
    .sort();
/** Belirli İstanbul gününe `count` okunmamış kayıt yazar (sayfalama ve gruplama senaryoları). */
async function seed(userId: string, kind: string, day: string, count: number) {
  await db.inAppNotification.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      userId,
      kind,
      refId: `r-${index}`,
      key: `${kind}:${day}:${index}:${userId}:${randomUUID()}`,
      createdAt: new Date(`${day}T12:00:00+03:00`),
    })),
  });
}

describe('uygulama içi kayıt: üretim', () => {
  it('bildirim niyetiyle AYNI işlemde yazılır; işlem geri alınırsa kayıt da yoktur', async () => {
    const user = await createUser(db);
    await expect(
      db.$transaction(async (tx) => {
        await stageNotification(tx, user, contact());
        throw new Error('geri al');
      }),
    ).rejects.toThrow('geri al');
    expect(await db.inAppNotification.count({ where: { userId: user } })).toBe(0);
    await stage(user, contact());
    expect(await kinds(user)).toEqual(['contact']);
    expect(await db.notificationIntent.count({ where: { userId: user } })).toBe(1);
  });

  it('aynı olay iki kez üretilse (yeniden deneme, eşzamanlı üretici) tek kayıt kalır', async () => {
    const user = await createUser(db);
    const eventId = randomUUID();
    await Promise.all([stage(user, contact(eventId)), stage(user, contact(eventId))]);
    await stage(user, contact(eventId));
    expect(await db.inAppNotification.count({ where: { userId: user } })).toBe(1);
  });

  it('e-posta tercihi kapalı olsa da kutuya düşer; e-posta niyetinin silinmesi kaydı silmez', async () => {
    const user = await createUser(db);
    await db.notificationPreference.create({
      data: { userId: user, type: 'CONTACT_REQUEST', enabled: false },
    });
    await stage(user, contact());
    expect(await kinds(user)).toEqual(['contact']);
    // E-posta aktarımı niyeti gönderince siler; kutudaki kayıt ve okundu bilgisi kalır.
    await db.notificationIntent.deleteMany({ where: { userId: user } });
    expect(await kinds(user)).toEqual(['contact']);
  });

  it.each([
    [
      'randevu',
      { type: 'appointment', event: 'confirmed', appointmentId: 'ap-1' } as const,
      'appointmentConfirmed',
    ],
    [
      'CV incelemesi',
      { type: 'cvReview', event: 'answered', requestId: 'cv-1' } as const,
      'cvReviewAnswered',
    ],
    [
      'başvuru dönemi',
      { type: 'applicationWindow', event: 'reminder', cycle: '2030-06' } as const,
      'applicationWindowReminder',
    ],
    [
      'ilan yayını',
      {
        type: 'generic',
        event: 'jobPostingPublished',
        eventId: 'j-1',
        path: '/ilanlarim',
      } as const,
      'jobPostingPublished',
    ],
  ])('%s bildirimi doğru türle kutuya yazılır', async (_name, payload, kind) => {
    const user = await createUser(db);
    await stage(user, payload);
    expect(await kinds(user)).toEqual([kind]);
  });

  it('kutuya girmeyenler: ilan özeti niyeti, aylık özet ve davet (hedef sayfa yok / kişisel adres)', async () => {
    const user = await createUser(db);
    await stage(user, { type: 'jobMatch', event: 'digest', day: '2030-06-20' });
    await stage(user, { type: 'monthlyDigest', event: 'summary', cycle: '2030-06' });
    await db.$transaction((tx) =>
      stagePilotInvitation(tx, user, 'ornek@example.org', 'x'.repeat(40)),
    );
    expect(await db.notificationIntent.count({ where: { userId: user } })).toBe(3);
    expect(await db.inAppNotification.count({ where: { userId: user } })).toBe(0);
  });

  it('kayıt kişisel veri taşımaz: yalnız tür, kimlik ve zaman', async () => {
    const user = await createUser(db);
    await stage(user, contact('olay-1'));
    const [row] = await db.inAppNotification.findMany({ where: { userId: user } });
    expect(Object.keys(row!).sort()).toEqual(
      ['createdAt', 'id', 'key', 'kind', 'readAt', 'refId', 'userId'].sort(),
    );
    expect(JSON.stringify(row)).not.toMatch(/@|hesap\/iletisim/);
  });
});

describe('uygulama içi kutu: okuma yetkisi ve sızıntı', () => {
  it('kullanıcı yalnız KENDİ bildirimlerini görür; başkasının kaydı listede, sayıda ve işaretlemede yoktur', async () => {
    const [a, b] = [await createUser(db), await createUser(db)];
    await seed(a, 'contact', '2030-06-19', 2);
    await seed(b, 'jobMatchPosting', '2030-06-19', 3);

    const pageA = await listMyInbox(deps, a);
    expect(pageA.groups.map((g) => [g.kind, g.count])).toEqual([['contact', 2]]);
    expect(pageA.unread).toBe(2);
    const pageB = await listMyInbox(deps, b);
    expect(pageB.groups.map((g) => [g.kind, g.count])).toEqual([['jobMatchPosting', 3]]);

    const bIds = pageB.groups.flatMap((g) => g.ids);
    // A, B'nin kimliklerini bilse bile hiçbirini işaretleyemez.
    expect(await markInboxRead(deps, a, { ids: bIds })).toEqual({ marked: 0 });
    expect(await countMyUnread(deps, b)).toBe(3);
    // "Hepsini okundu yap" yalnız çağıranı etkiler.
    expect(await markAllInboxRead(deps, a)).toEqual({ marked: 2 });
    expect(await countMyUnread(deps, a)).toBe(0);
    expect(await countMyUnread(deps, b)).toBe(3);
  });

  it('karışık kimlik listesinde yalnız kendi kayıtları işaretlenir ve sayılır', async () => {
    const [a, b] = [await createUser(db), await createUser(db)];
    await seed(a, 'contact', '2030-06-19', 1);
    await seed(b, 'contact', '2030-06-19', 1);
    const mine = (await listMyInbox(deps, a)).groups.flatMap((g) => g.ids);
    const theirs = (await listMyInbox(deps, b)).groups.flatMap((g) => g.ids);
    expect(await markInboxRead(deps, a, { ids: [...mine, ...theirs, 'olmayan-kimlik'] })).toEqual({
      marked: 1,
    });
    expect(await countMyUnread(deps, b)).toBe(1);
  });

  it('geçersiz işaretleme girdisi reddedilir (boş liste, aşırı uzun kimlik, fazla kimlik, fazladan alan)', async () => {
    const user = await createUser(db);
    for (const bad of [
      { ids: [] },
      { ids: ['x'.repeat(65)] },
      { ids: Array.from({ length: 201 }, (_, i) => `id${i}`) },
      { ids: ['a'], userId: 'baska' },
      {},
    ])
      await expect(
        markInboxRead(deps, user, bad),
        JSON.stringify(bad).slice(0, 40),
      ).rejects.toThrow();
  });
});

describe('uygulama içi kutu: okundu durumu ve gruplama', () => {
  it('okundu işaretlenince grup ve rozet sayısı düşer; yeniden işaretlemek hiçbir şeyi değiştirmez', async () => {
    const user = await createUser(db);
    await seed(user, 'jobMatchPosting', '2030-06-19', 3);
    await seed(user, 'contact', '2030-06-19', 1);
    const before = await listMyInbox(deps, user);
    expect(before.unread).toBe(4);
    const jobs = before.groups.find((g) => g.kind === 'jobMatchPosting')!;
    expect(jobs).toMatchObject({ count: 3, unread: 3, href: '/ilanlar' });

    expect(await markInboxRead(deps, user, { ids: jobs.ids })).toEqual({ marked: 3 });
    expect(await markInboxRead(deps, user, { ids: jobs.ids })).toEqual({ marked: 0 });
    const after = await listMyInbox(deps, user);
    expect(after.unread).toBe(1);
    expect(after.groups.find((g) => g.kind === 'jobMatchPosting')).toMatchObject({
      count: 3,
      unread: 0,
    });
    const readAt = await db.inAppNotification.findFirstOrThrow({
      where: { userId: user, kind: 'jobMatchPosting' },
      select: { readAt: true },
    });
    expect(readAt.readAt).toEqual(new Date('2030-06-20T09:00:00Z'));
  });

  it('okunmamış sayısı üst sınırlıdır (rozet "99+")', async () => {
    const user = await createUser(db);
    await seed(user, 'contact', '2030-06-19', INBOX_UNREAD_CAP + 5);
    expect(await countMyUnread(deps, user)).toBe(INBOX_UNREAD_CAP);
  });

  it('yeni bildirim aynı gün + türde mevcut satıra eklenir (üç ilan = "3 yeni ilan")', async () => {
    const user = await createUser(db);
    await seed(user, 'jobMatchPosting', '2030-06-19', 2);
    await seed(user, 'jobMatchPosting', '2030-06-19', 1);
    const page = await listMyInbox(deps, user);
    expect(page.groups).toHaveLength(1);
    expect(page.groups[0]).toMatchObject({ kind: 'jobMatchPosting', count: 3, day: '2030-06-19' });
  });

  it('boş kutu: boş liste, imleç yok, okunmamış 0', async () => {
    const user = await createUser(db);
    expect(await listMyInbox(deps, user)).toEqual({ groups: [], nextCursor: null, unread: 0 });
  });
});

describe('uygulama içi kutu: gün bazlı sayfalama', () => {
  it('bir grup iki sayfaya bölünmez; yarım kalan gün bütünüyle ikinci sayfaya kalır', async () => {
    const user = await createUser(db);
    // 60 + 60 + 5 = 125 kayıt (> 100). İlk 101 satır 60 (18 Haz) + 41 (17 Haz): 17 Haz yarım kaldığından ikinci sayfaya kalır.
    await seed(user, 'contact', '2030-06-18', 60);
    await seed(user, 'contact', '2030-06-17', 60);
    await seed(user, 'contact', '2030-06-16', 5);
    const first = await listMyInbox(deps, user);
    expect(first.groups.map((g) => [g.day, g.count])).toEqual([['2030-06-18', 60]]);
    expect(first.nextCursor).toBe('2030-06-18');
    const second = await listMyInbox(deps, user, { cursor: first.nextCursor! });
    // 17 Haz grubu 41 değil 60'tır: iki sayfaya bölünmedi.
    expect(second.groups.map((g) => [g.day, g.count])).toEqual([
      ['2030-06-17', 60],
      ['2030-06-16', 5],
    ]);
    expect(second.nextCursor).toBeNull();
    // Hiçbir kayıt iki sayfada birden ya da hiç görünmez.
    const ids = [...first.groups, ...second.groups].flatMap((g) => g.ids);
    expect(ids).toHaveLength(125);
    expect(new Set(ids).size).toBe(125);
  });

  it('çok günlü uzun kutuda sayfalar sırayla devam eder ve toplamda her kayıt bir kez görünür', async () => {
    const user = await createUser(db);
    for (const [day, count] of [
      ['2030-06-18', 70],
      ['2030-06-17', 70],
      ['2030-06-16', 70],
      ['2030-06-15', 70],
    ] as const)
      await seed(user, 'contact', day, count);
    const seen: string[] = [];
    const groups: [string, number][] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const page = await listMyInbox(deps, user, cursor ? { cursor } : {});
      for (const group of page.groups) {
        seen.push(...group.ids);
        groups.push([group.day, group.count]);
      }
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(groups).toEqual([
      ['2030-06-18', 70],
      ['2030-06-17', 70],
      ['2030-06-16', 70],
      ['2030-06-15', 70],
    ]);
    expect(new Set(seen).size).toBe(280);
    expect(pages).toBeGreaterThan(1);
  });

  it('tek gün sayfa sınırını aşsa da o gün bütün okunur ve imleç ilerler', async () => {
    const user = await createUser(db);
    await seed(user, 'contact', '2030-06-18', 150);
    await seed(user, 'contact', '2030-06-10', 2);
    const first = await listMyInbox(deps, user);
    expect(first.groups.map((g) => [g.day, g.count])).toEqual([['2030-06-18', 150]]);
    expect(first.nextCursor).toBe('2030-06-18');
    const second = await listMyInbox(deps, user, { cursor: first.nextCursor! });
    expect(second.groups.map((g) => [g.day, g.count])).toEqual([['2030-06-10', 2]]);
    expect(second.nextCursor).toBeNull();
  });

  it('İstanbul gün sınırı: gece yarısından sonraki kayıt ertesi günün grubundadır', async () => {
    const user = await createUser(db);
    await db.inAppNotification.createMany({
      data: [
        {
          userId: user,
          kind: 'contact',
          refId: 'a',
          key: randomUUID(),
          createdAt: new Date('2030-06-18T21:30:00Z'),
        },
        {
          userId: user,
          kind: 'contact',
          refId: 'b',
          key: randomUUID(),
          createdAt: new Date('2030-06-18T20:30:00Z'),
        },
      ],
    });
    const page = await listMyInbox(deps, user);
    expect(page.groups.map((g) => [g.day, g.count])).toEqual([
      ['2030-06-19', 1],
      ['2030-06-18', 1],
    ]);
  });

  it('geçersiz imleç tarihi ve kullanıcı alanı sözleşmede reddedilir', async () => {
    const { listInboxInputSchema } = await import('@/contracts/inbox');
    for (const bad of [{ cursor: '2030-13-45' }, { cursor: 'dün' }, { userId: 'baska' }])
      expect(listInboxInputSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(listInboxInputSchema.safeParse({ cursor: '2030-06-18' }).success).toBe(true);
  });
});

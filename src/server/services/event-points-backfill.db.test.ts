import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_POINT_RULES } from '@/contracts/points';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser, type Institution } from '@/test/fixtures';

import { seedPointRules } from '../../../prisma/seed-points';
import { scanCampusEventPatterns } from './campus-event';
import { awardForEventAttendance, runPointBackfill } from './points';

// Etkinlik katılımı puanının uzlaştırma yolu (P2-14): katılım ve puan normalde aynı işlemde yazılır; kural sonradan açılınca/atlanınca
// `points.backfill` eksik kalanı, giriş akışıyla AYNI aylık tavan ve sıra kuralıyla tamamlar. Her koşu idempotenttir.
const db = createTestPrisma();
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2031-03-20T09:00:00Z');
/** Paylaşılan test veritabanı başka testlerin satırlarıyla dolu olabilir: tam tarama yerine bu testin 8 günlük penceresi koşulur (aksi hâlde tam pakette 15 sn'yi aşar). */
const SINCE = new Date(NOW.getTime() - 8 * DAY);
let inst: Institution;

beforeAll(async () => {
  await seedPointRules(db);
  inst = await createInstitution(db);
});
afterAll(async () => {
  await db.pointRule.update({
    where: { action: 'EVENT_ATTENDED' },
    data: { ...DEFAULT_POINT_RULES.EVENT_ATTENDED, isActive: true },
  });
  await db.$disconnect();
});

const setRule = (isActive: boolean) =>
  db.pointRule.update({ where: { action: 'EVENT_ATTENDED' }, data: { isActive } });

async function student() {
  const userId = await createUser(db);
  await addMembership(db, { userId, departmentId: inst.deptA1, role: 'STUDENT', entryYear: 2024 });
  return userId;
}
async function event(startsAt: Date, status: 'PUBLISHED' | 'CANCELLED' = 'PUBLISHED') {
  const row = await db.campusEvent.create({
    data: {
      title: 'Örnek etkinlik',
      description: 'Uzlaştırma testi için etkinlik',
      location: 'Kampüs',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      capacity: 50,
      status,
      ...(status === 'CANCELLED' ? { reviewReason: 'iptal', reviewedAt: NOW } : {}),
    },
    select: { id: true },
  });
  return row.id;
}
const attend = (eventId: string, userId: string, attendedAt: Date) =>
  db.eventAttendance.create({ data: { eventId, userId, attendedAt } });
const entries = (userId: string) =>
  db.pointEntry.findMany({
    where: { userId, action: 'EVENT_ATTENDED' },
    orderBy: { eventAt: 'asc' },
  });

describe('etkinlik katılımı puan uzlaştırması', () => {
  it('kural sonradan açılınca eksik puanı yazar; aylık dört puanlı tavan KATILIM SIRASINA göredir; ikinci koşu hiçbir şey eklemez', async () => {
    const user = await student();
    await setRule(false);
    const days = [1, 2, 3, 4, 5, 6];
    // Veritabanına TERS sırada yazılır: uzlaştırma yine katılım zamanına göre sıralar.
    for (const day of [...days].reverse()) {
      const start = new Date(NOW.getTime() - day * DAY);
      await attend(await event(start), user, new Date(start.getTime() + 600_000));
    }
    await runPointBackfill({ db, now: () => NOW }, { since: SINCE });
    expect(await entries(user)).toHaveLength(0); // kural pasifken puan yok
    await setRule(true);
    const first = await runPointBackfill({ db, now: () => NOW }, { since: SINCE });
    expect(first.eventAttendances).toBeGreaterThanOrEqual(6);
    const rows = await entries(user);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.multiplierPercent)).toEqual([100, 100, 100, 100, 0, 0]);
    expect(rows.map((r) => r.points)).toEqual([5, 5, 5, 5, 0, 0]);
    const second = await runPointBackfill({ db, now: () => NOW }, { since: SINCE });
    expect(second.created).toBe(0);
    expect(await entries(user)).toHaveLength(6);
  });

  it('iptal edilen etkinlik puan üretmez; geri alınmış kayıt yeniden doğmaz; askıdaki alıcı atlanır', async () => {
    await setRule(true);
    const user = await student();
    const banned = await student();
    await db.user.update({ where: { id: banned }, data: { banned: true } });
    const start = new Date(NOW.getTime() - 2 * DAY);
    const cancelled = await event(start, 'CANCELLED');
    const live = await event(new Date(start.getTime() + 3_600_000));
    await attend(cancelled, user, start);
    await attend(live, user, new Date(start.getTime() + 3_700_000));
    await attend(live, banned, new Date(start.getTime() + 3_800_000));
    await runPointBackfill({ db, now: () => NOW }, { since: SINCE });
    const rows = await entries(user);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sourceId).toBe(live);
    expect(await entries(banned)).toHaveLength(0);
    await db.pointEntry.update({
      where: { id: rows[0]!.id },
      data: { status: 'REVOKED', revokedReason: 'FRAUD_CONFIRMED', revokedAt: NOW },
    });
    await runPointBackfill({ db, now: () => NOW }, { since: SINCE });
    expect(await entries(user)).toHaveLength(1);
    expect((await entries(user))[0]!.status).toBe('REVOKED');
  });

  it('geri alınan katılım aynı ayın dört puanlı hakkını tüketmez', async () => {
    await setRule(true);
    const user = await student();
    const events: string[] = [];
    for (const day of [5, 4, 3, 2, 1]) {
      const start = new Date(NOW.getTime() - day * DAY);
      const id = await event(start);
      await attend(id, user, new Date(start.getTime() + 60_000));
      events.push(id);
    }
    await awardForEventAttendance({ db, now: () => NOW }, events[0]!, user);
    await db.pointEntry.updateMany({
      where: { userId: user, action: 'EVENT_ATTENDED', sourceId: events[0] },
      data: { status: 'REVOKED', revokedReason: 'FRAUD_CONFIRMED', revokedAt: NOW },
    });
    for (const id of events.slice(1))
      await awardForEventAttendance({ db, now: () => NOW }, id, user);
    const bySource = new Map((await entries(user)).map((row) => [row.sourceId, row]));
    expect(bySource.get(events[0]!)?.status).toBe('REVOKED');
    for (const id of events.slice(1)) {
      expect(bySource.get(id)).toMatchObject({ multiplierPercent: 100, points: 5 });
    }
  });

  it('`since` penceresi dışındaki katılım dokunulmaz; tek tek çağrı da idempotenttir ve iptal/olmayan katılımda null döner', async () => {
    await setRule(true);
    const user = await student();
    const start = new Date(NOW.getTime() - 30 * DAY);
    const old = await event(start);
    await attend(old, user, new Date(start.getTime() + 60_000));
    await runPointBackfill({ db, now: () => NOW }, { since: new Date(NOW.getTime() - 7 * DAY) });
    expect(await entries(user)).toHaveLength(0);
    const first = await awardForEventAttendance({ db, now: () => NOW }, old, user);
    expect(first).toMatchObject({ created: true });
    expect(await awardForEventAttendance({ db, now: () => NOW }, old, user)).toMatchObject({
      created: false,
      skipped: 'DUPLICATE',
    });
    expect(await awardForEventAttendance({ db, now: () => NOW }, old, await student())).toBeNull();
    const cancelled = await event(start, 'CANCELLED');
    await attend(cancelled, user, start);
    expect(await awardForEventAttendance({ db, now: () => NOW }, cancelled, user)).toBeNull();
  });

  it('çarpan yalnız kendinden ÖNCEKİ katılımlara bağlıdır: tek tek çağrı sırası sonucu değiştirmez', async () => {
    await setRule(true);
    const user = await student();
    const events: { id: string; at: Date }[] = [];
    for (const day of [5, 4, 3, 2, 1]) {
      const start = new Date(NOW.getTime() - day * DAY);
      const id = await event(start);
      const at = new Date(start.getTime() + 60_000);
      await attend(id, user, at);
      events.push({ id, at });
    }
    // Zamanca en son katılım ÖNCE puanlanır; sonra önceki dördü.
    const order = [events[4]!, events[0]!, events[1]!, events[2]!, events[3]!];
    for (const e of order) await awardForEventAttendance({ db, now: () => NOW }, e.id, user);
    const bySource = new Map(
      (await entries(user)).map((row) => [row.sourceId, row.multiplierPercent]),
    );
    expect(events.map((e) => bySource.get(e.id))).toEqual([100, 100, 100, 100, 100]);
  });

  it('uzlaştırmayla yazılan puanlar da şüphe taramasından geçer: aynı saniye 3+ katılım bir kez işaretlenir, tekrar taramada çoğalmaz', async () => {
    await setRule(true);
    const people = [await student(), await student(), await student()];
    const start = new Date(NOW.getTime() - 3_600_000);
    const id = await event(start);
    const same = new Date(start.getTime() + 120_000);
    for (const user of people) await attend(id, user, same);
    await runPointBackfill({ db, now: () => NOW }, { since: SINCE });
    expect(await db.pointEntry.count({ where: { sourceId: id, status: 'PENDING' } })).toBe(3);
    const flagged = await scanCampusEventPatterns(db, NOW);
    expect(flagged).toBeGreaterThanOrEqual(3);
    const count = () =>
      db.suspicionFlag.count({ where: { userId: { in: people }, rule: 'EVENT_BURST' } });
    expect(await count()).toBe(3);
    expect(await scanCampusEventPatterns(db, NOW)).toBe(0);
    expect(await count()).toBe(3);
    // işaret ceza değildir: puanlar bekler, kesinleşmeden önce insan kararı
    expect(await db.pointEntry.count({ where: { sourceId: id, status: 'REVOKED' } })).toBe(0);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { POINT_ACTIONS } from '@/contracts/points';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
  type Institution,
} from '@/test/fixtures';

import { awardForExperience, awardForSession, finalizeDuePoints } from './points';
import {
  decideSuspicion,
  listPointEntries,
  listPointRules,
  listSuspicionFlags,
  requestPointBackfill,
  revokePointEntry,
  updatePointRule,
} from './points-admin';
import { runSuspicionScan } from './points-scan';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date('2030-06-20T12:00:00Z');
const deps = { db, now: () => now, foundingUntil: null };
let inst: Institution;
let admin: string;
beforeAll(async () => {
  inst = await createInstitution(db);
  const { seedPointRules } = await import('../../../prisma/seed-points');
  await seedPointRules(db);
  admin = await createUser(db);
  await addMembership(db, { userId: admin, departmentId: inst.deptA1, role: 'ACADEMIC' });
  await addGrant(db, { userId: admin, scope: 'SYSTEM' });
  await grantRequiredConsents(db, admin);
});

async function member(role: 'STUDENT' | 'ALUMNI' = 'STUDENT') {
  const userId = await createUser(db);
  await addMembership(
    db,
    role === 'STUDENT'
      ? { userId, departmentId: inst.deptA1, role, entryYear: 2024 }
      : { userId, departmentId: inst.deptA1, role, graduationYear: 2020 },
  );
  await grantRequiredConsents(db, userId);
  return userId;
}
const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return isCodedError(error) ? error.code : error instanceof Error ? error.name : 'unexpected';
  }
};
async function session(
  mentor: string,
  student: string,
  startsAt: Date,
  mode: 'ONLINE' | 'IN_PERSON' = 'ONLINE',
  gapMs = 5 * 60_000,
) {
  const row = await db.appointment.create({
    data: {
      mentorId: mentor,
      menteeId: student,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      expiresAt: new Date(startsAt.getTime() - DAY),
      decidedAt: new Date(startsAt.getTime() - DAY),
      mode,
      status: 'COMPLETED',
    },
  });
  const at = new Date(startsAt.getTime() + 2 * HOUR);
  await db.sessionFeedback.createMany({
    data: [
      { appointmentId: row.id, authorId: mentor, happened: true, createdAt: at },
      {
        appointmentId: row.id,
        authorId: student,
        happened: true,
        createdAt: new Date(at.getTime() + gapMs),
      },
    ],
  });
  await awardForSession(deps, row.id);
  return row;
}
const entriesOf = (userId: string) =>
  db.pointEntry.findMany({ where: { userId }, orderBy: { eventAt: 'asc' } });
const audit = (targetId: string) => db.adminAuditLog.findMany({ where: { targetId } });
const scan = () => runSuspicionScan(deps);
const flagsOf = (userId: string) =>
  db.suspicionFlag.findMany({ where: { userId }, orderBy: { rule: 'asc' } });

/** Üç ay üst üste aynı ikili: 10 + 5 + 2 = 17 puan, hepsi tek öğrenciden. */
async function repeatedPair(gapMs?: number) {
  const mentor = await member('ALUMNI');
  const student = await member();
  const sessions = [];
  for (const iso of ['2030-04-10T10:00:00Z', '2030-05-10T10:00:00Z', '2030-06-10T10:00:00Z'])
    sessions.push(await session(mentor, student, new Date(iso), 'ONLINE', gapMs));
  return { mentor, student, sessions };
}

describe('kural yönetimi (yalnız sistem yöneticisi)', () => {
  it('listeler ve değiştirir; işlem kaydı eski değerleri taşır; yalnız yeni kayıtlar etkilenir', async () => {
    const rules = await listPointRules(deps, admin);
    expect(rules.map((r) => r.action)).toEqual([...POINT_ACTIONS]);
    expect(rules).toHaveLength(POINT_ACTIONS.length);
    try {
      const updated = await updatePointRule(deps, admin, {
        action: 'CV_REVIEW_HELPFUL',
        points: 4,
        delayDays: 2,
        isActive: false,
        reason: 'Ağırlık ayarı',
      });
      expect(updated).toMatchObject({
        action: 'CV_REVIEW_HELPFUL',
        points: 4,
        delayDays: 2,
        isActive: false,
      });
      const [log] = await audit('CV_REVIEW_HELPFUL');
      expect(log).toMatchObject({
        actorId: admin,
        action: 'POINT_RULE_CHANGE',
        targetType: 'POINT_RULE',
        reason: 'Ağırlık ayarı',
      });
      expect(log!.metadata).toMatchObject({
        points: 4,
        previousPoints: 3,
        previousDelayDays: 0,
        previousIsActive: true,
      });
      expect(
        (await db.pointRule.findUniqueOrThrow({ where: { action: 'CV_REVIEW_HELPFUL' } }))
          .updatedById,
      ).toBe(admin);
    } finally {
      await db.pointRule.update({
        where: { action: 'CV_REVIEW_HELPFUL' },
        data: { points: 3, delayDays: 0, isActive: true },
      });
    }
  });

  it('eksik kural satırını oluşturur (upsert)', async () => {
    await db.pointRule.delete({ where: { action: 'FAQ_ANSWER_PARTICIPATION' } });
    const created = await updatePointRule(deps, admin, {
      action: 'FAQ_ANSWER_PARTICIPATION',
      points: 1,
      delayDays: 0,
      isActive: true,
      reason: 'Yeniden kuruldu',
    });
    expect(created.points).toBe(1);
    expect((await audit('FAQ_ANSWER_PARTICIPATION'))[0]!.metadata).toMatchObject({
      previousPoints: null,
    });
  });

  it('yetkisiz çağrı ve geçersiz girdi reddedilir; hiçbir şey değişmez', async () => {
    const plain = await member();
    const departmentAdmin = await member();
    await addGrant(db, { userId: departmentAdmin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    const input = {
      action: 'SESSION_ONLINE' as const,
      points: 99,
      delayDays: 0,
      isActive: true,
      reason: 'deneme',
    };
    for (const who of [plain, departmentAdmin]) {
      expect(await code(updatePointRule(deps, who, input))).toBe('AUTH_FORBIDDEN');
      expect(await code(listPointRules(deps, who))).toBe('AUTH_FORBIDDEN');
    }
    expect(await code(updatePointRule(deps, admin, { ...input, points: 101 }))).toBe('ZodError');
    expect(await code(updatePointRule(deps, admin, { ...input, reason: 'x' }))).toBe('ZodError');
    expect(
      (await db.pointRule.findUniqueOrThrow({ where: { action: 'SESSION_ONLINE' } })).points,
    ).toBe(10);
  });
});

describe('puan iptali ve geri alma', () => {
  it('bekleyen kaydı iptal eder: gerekçe + işlem kaydı, toplamdan düşer, kesinleştirme geri getirmez', async () => {
    const mentor = await member('ALUMNI');
    const student = await member();
    const row = await session(mentor, student, new Date(now.getTime() - 3 * DAY), 'IN_PERSON');
    const [entry] = await entriesOf(mentor);
    expect(entry!.status).toBe('PENDING');
    const out = await revokePointEntry(deps, admin, { entryId: entry!.id, reason: 'Hatalı kayıt' });
    expect(out).toEqual({ entryId: entry!.id, badgeRevoked: false });
    expect((await entriesOf(mentor))[0]).toMatchObject({
      status: 'REVOKED',
      revokedById: admin,
      revokedReason: 'ADMIN_CANCEL',
    });
    expect((await entriesOf(mentor))[0]!.revokedAt).toEqual(now);
    expect(await audit(entry!.id)).toMatchObject([
      {
        action: 'POINTS_REVOKE',
        targetType: 'POINT_ENTRY',
        reason: 'Hatalı kayıt',
        metadata: {
          pointAction: 'SESSION_IN_PERSON',
          previousStatus: 'PENDING',
          badgeRevoked: false,
        },
      },
    ]);
    await finalizeDuePoints({ db, now: () => new Date(now.getTime() + 30 * DAY) });
    expect((await entriesOf(mentor))[0]!.status).toBe('REVOKED');
    void row;
  });

  it('kesinleşmiş deneyim puanı geri alınınca kurucu üye etiketi de düşer; ikinci geri alma reddedilir', async () => {
    const author = await member();
    const moderator = await member();
    const exp = await db.experience.create({
      data: {
        authorId: author,
        departmentIdAtWrite: inst.deptA1,
        type: 'INTERNSHIP',
        status: 'PUBLISHED',
        isAnonymous: false,
        organizationName: 'Kurum',
        termYear: 2026,
        termSeason: 'SUMMER',
        durationWeeks: 8,
        pay: 'PAID',
        applicationChannel: 'COMPANY_SITE',
        whatLearned: 'x',
        advice: 'y',
        moderatedById: moderator,
        moderatedAt: now,
        publishedAt: now,
      },
    });
    await awardForExperience(deps, exp.id);
    const [entry] = await entriesOf(author);
    expect(await db.userBadge.count({ where: { userId: author, revokedAt: null } })).toBe(1);
    const out = await revokePointEntry(deps, admin, { entryId: entry!.id, reason: 'Sahte içerik' });
    expect(out.badgeRevoked).toBe(true);
    expect(await db.userBadge.count({ where: { userId: author, revokedAt: null } })).toBe(0);
    expect((await db.userBadge.findFirstOrThrow({ where: { userId: author } })).revokedAt).toEqual(
      now,
    );
    expect(
      await code(revokePointEntry(deps, admin, { entryId: entry!.id, reason: 'Tekrar' })),
    ).toBe('POINT_ALREADY_REVOKED');
    // geri alınan etiket yeni deneyimle otomatik yeniden verilmez
    const second = await db.experience.create({
      data: { ...exp, id: undefined, publishedAt: new Date(now.getTime() + HOUR) } as never,
    });
    await awardForExperience(deps, second.id);
    expect(await db.userBadge.count({ where: { userId: author, revokedAt: null } })).toBe(0);
  });

  it('eşzamanlı iki geri almadan yalnız biri başarılı olur', async () => {
    const mentor = await member('ALUMNI');
    const student = await member();
    await session(mentor, student, new Date('2030-06-10T10:00:00Z'));
    const [entry] = await entriesOf(mentor);
    const results = await Promise.all([
      code(revokePointEntry(deps, admin, { entryId: entry!.id, reason: 'Birinci' })),
      code(revokePointEntry(deps, admin, { entryId: entry!.id, reason: 'İkinci' })),
    ]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(results.filter((r) => r === 'POINT_ALREADY_REVOKED')).toHaveLength(1);
    expect(await audit(entry!.id)).toHaveLength(1);
  });

  it('yetkisiz, bilinmeyen kayıt ve eksik gerekçe reddedilir', async () => {
    const mentor = await member('ALUMNI');
    const student = await member();
    await session(mentor, student, new Date('2030-06-10T10:00:00Z'));
    const [entry] = await entriesOf(mentor);
    expect(
      await code(revokePointEntry(deps, mentor, { entryId: entry!.id, reason: 'Kendi puanım' })),
    ).toBe('AUTH_FORBIDDEN');
    expect(await code(revokePointEntry(deps, admin, { entryId: 'yok', reason: 'Deneme' }))).toBe(
      'RESOURCE_NOT_FOUND',
    );
    expect(await code(revokePointEntry(deps, admin, { entryId: entry!.id, reason: '' }))).toBe(
      'ZodError',
    );
    expect((await entriesOf(mentor))[0]!.status).toBe('FINAL');
    expect(await audit(entry!.id)).toHaveLength(0);
  });

  it('yönetici kayıt listesi yalnız hedef kullanıcıyı verir, kaynak kimliği çıkarmaz, sayfalanır', async () => {
    const mentor = await member('ALUMNI');
    const student = await member();
    const row = await session(mentor, student, new Date('2030-04-10T10:00:00Z'));
    await session(mentor, student, new Date('2030-05-10T10:00:00Z'));
    const page = await listPointEntries(deps, admin, { userId: mentor, limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    const rest = await listPointEntries(deps, admin, {
      userId: mentor,
      limit: 5,
      cursor: page.nextCursor!,
    });
    expect(rest.items).toHaveLength(1);
    const text = JSON.stringify([page, rest]);
    for (const secret of [row.id, student, 'sourceId']) expect(text).not.toContain(secret);
    expect(
      (await listPointEntries(deps, admin, { userId: mentor, status: 'REVOKED' })).items,
    ).toEqual([]);
    expect(await code(listPointEntries(deps, admin, { userId: 'yok' }))).toBe('RESOURCE_NOT_FOUND');
    expect(await code(listPointEntries(deps, mentor, { userId: mentor }))).toBe('AUTH_FORBIDDEN');
  });
});

describe('şüphe taraması', () => {
  it('tek karşı taraftan tekrarlı puan işaretlenir; sıradan kullanıcı işaretlenmez; tekrar tarama çift işaret üretmez', async () => {
    const { mentor, sessions } = await repeatedPair();
    const normalMentor = await member('ALUMNI');
    await session(normalMentor, await member(), new Date('2030-06-10T10:00:00Z'));
    const first = await scan();
    expect(first.scanned).toBeGreaterThanOrEqual(2);
    const flags = await flagsOf(mentor);
    expect(flags.map((f) => f.rule)).toEqual(['SINGLE_COUNTERPART']);
    expect(flags[0]).toMatchObject({
      status: 'OPEN',
      entryCount: 3,
      points: 17,
      sharePercent: 100,
      syncedCount: null,
    });
    expect(flags[0]!.entryIds.sort()).toEqual((await entriesOf(mentor)).map((e) => e.id).sort());
    expect(await flagsOf(normalMentor)).toHaveLength(0);
    await scan();
    expect(await flagsOf(mentor)).toHaveLength(1);
    void sessions;
  });

  it('aynı dakikada yanıtlanan tekrarlı görüşmeler SYNC_FEEDBACK işareti üretir', async () => {
    const { mentor } = await repeatedPair(10_000);
    await scan();
    const flags = await flagsOf(mentor);
    expect(flags.map((f) => f.rule)).toEqual(['SINGLE_COUNTERPART', 'SYNC_FEEDBACK']);
    expect(flags.find((f) => f.rule === 'SYNC_FEEDBACK')).toMatchObject({
      syncedCount: 3,
      entryCount: 3,
      points: 17,
    });
  });

  it('kısa sürede eşik üstü puan BURST işareti üretir', async () => {
    const mentor = await member('ALUMNI');
    for (let i = 0; i < 4; i += 1) {
      await session(mentor, await member(), new Date(`2030-06-10T0${i + 6}:00:00Z`));
    }
    await scan();
    const flags = await flagsOf(mentor);
    expect(flags.map((f) => f.rule)).toEqual(['BURST']);
    expect(flags[0]).toMatchObject({ points: 40, entryCount: 4 });
  });

  it('geri alınmış kayıtlar taramaya girmez', async () => {
    const { mentor } = await repeatedPair();
    await db.pointEntry.updateMany({
      where: { userId: mentor },
      data: { status: 'REVOKED', revokedAt: now, revokedReason: 'ADMIN_CANCEL' },
    });
    await scan();
    expect(await flagsOf(mentor)).toHaveLength(0);
  });

  it('aynı (kullanıcı, kural) için karar bekleyen ikinci işaret veritabanınca reddedilir', async () => {
    const { mentor } = await repeatedPair();
    await scan();
    await expect(
      db.suspicionFlag.create({
        data: {
          userId: mentor,
          rule: 'SINGLE_COUNTERPART',
          evidenceKey: 'baska-kanit',
          entryIds: [],
          windowStart: now,
          windowEnd: now,
          entryCount: 0,
          points: 0,
        },
      }),
    ).rejects.toThrow();
  });
  it('SYNC_FEEDBACK 180 günlük pencerede aranır (SINGLE_COUNTERPART 90 günlük pencerede)', async () => {
    const mentor = await member('ALUMNI');
    const student = await member();
    for (const iso of ['2030-01-10T10:00:00Z', '2030-02-10T10:00:00Z', '2030-03-10T10:00:00Z'])
      await session(mentor, student, new Date(iso), 'ONLINE', 10_000);
    await scan();
    expect((await flagsOf(mentor)).map((f) => f.rule)).toEqual(['SYNC_FEEDBACK']);
  });

  it('puanı 0 olan (aylık tavana takılan) görüşmeler taramaya girmez', async () => {
    const mentor = await member('ALUMNI');
    const student = await member();
    // aynı ay: yalnız ilki puanlı; diğerleri çarpan 0 ve aynı dakikada yanıtlanmış olsa da sayılmaz
    for (const iso of ['2030-06-02T10:00:00Z', '2030-06-04T10:00:00Z', '2030-06-06T10:00:00Z'])
      await session(mentor, student, new Date(iso), 'ONLINE', 10_000);
    expect((await entriesOf(mentor)).map((e) => e.points)).toEqual([10, 0, 0]);
    await scan();
    expect(await flagsOf(mentor)).toHaveLength(0);
  });

  it('yanıt kaydı eksik görüşme taramayı bozmaz', async () => {
    const mentor = await member('ALUMNI');
    const student = await member();
    const rows = [];
    for (const iso of ['2030-04-10T10:00:00Z', '2030-05-10T10:00:00Z', '2030-06-10T10:00:00Z'])
      rows.push(await session(mentor, student, new Date(iso), 'ONLINE', 10_000));
    await db.sessionFeedback.deleteMany({
      where: { appointmentId: rows[0]!.id, authorId: student },
    });
    await expect(scan()).resolves.toBeTruthy();
    // eksik yanıtlı görüşme senkron sayılmaz: 2 görüşme < 3
    expect((await flagsOf(mentor)).map((f) => f.rule)).toEqual(['SINGLE_COUNTERPART']);
  });

  it('gelecekteki ve pencere dışındaki kayıtlar taramaya girmez', async () => {
    const mentor = await member('ALUMNI');
    const student = await member();
    for (const iso of ['2029-10-10T10:00:00Z', '2029-11-10T10:00:00Z', '2029-12-10T10:00:00Z'])
      await session(mentor, student, new Date(iso), 'ONLINE', 10_000);
    await scan();
    expect(await flagsOf(mentor)).toHaveLength(0);
    const future = await member('ALUMNI');
    for (const iso of ['2030-07-10T10:00:00Z', '2030-08-10T10:00:00Z', '2030-09-10T10:00:00Z'])
      await session(future, student, new Date(iso), 'ONLINE', 10_000);
    await scan();
    expect(await flagsOf(future)).toHaveLength(0);
  });
});

/** Aynı ikiliden doğrudan ek puan kaydı (yeni kanıt üretmek için; görüşme kurulumu gerekmez). */
async function extraEntry(mentor: string, student: string, eventAt: Date, points = 4) {
  return db.pointEntry.create({
    data: {
      userId: mentor,
      action: 'SESSION_ONLINE',
      sourceType: 'APPOINTMENT',
      sourceId: `ek-${Math.random().toString(36).slice(2)}`,
      counterpartId: student,
      basePoints: points,
      points,
      status: 'FINAL',
      eventAt,
    },
  });
}

describe('açık şüpheye yeni kanıt (kart 116)', () => {
  it('açık işaret varken aynı kural için yeni kanıt sayaç + son görülme olarak eklenir; yeni işaret açılmaz', async () => {
    const { mentor, student } = await repeatedPair();
    await scan();
    const [before] = await flagsOf(mentor);
    expect(before).toMatchObject({ recurrenceCount: 0, lastSeenAt: null, recentEvidence: [] });

    await extraEntry(mentor, student, new Date('2030-06-15T10:00:00Z'), 4);
    const out = await scan();
    expect(out.flagged).toBe(0); // yeni işaret açılmadı
    const flags = await flagsOf(mentor);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      id: before!.id,
      status: 'OPEN',
      recurrenceCount: 1,
      lastSeenAt: now,
      evidenceKey: before!.evidenceKey, // asıl kanıt değişmez
      entryCount: 3,
      points: 17,
    });
    expect(flags[0]!.entryIds).toEqual(before!.entryIds);
    expect(flags[0]!.seenEvidenceKeys).toHaveLength(1);
    expect(flags[0]!.recentEvidence).toEqual([
      { at: now.toISOString(), entryCount: 4, points: 21 },
    ]);
  });

  it('idempotent: aynı tarama iki kez sayacı bir kez artırır; her yeni kanıt bir artırır', async () => {
    const { mentor, student } = await repeatedPair();
    await scan();
    await extraEntry(mentor, student, new Date('2030-06-15T10:00:00Z'));
    await scan();
    await scan();
    await scan();
    expect((await flagsOf(mentor))[0]).toMatchObject({ recurrenceCount: 1 });
    await extraEntry(mentor, student, new Date('2030-06-16T10:00:00Z'));
    await scan();
    await scan();
    const [flag] = await flagsOf(mentor);
    expect(flag).toMatchObject({ recurrenceCount: 2 });
    expect(flag!.seenEvidenceKeys).toHaveLength(2);
    // en yeni özet başta
    expect(flag!.recentEvidence).toMatchObject([{ entryCount: 5 }, { entryCount: 4 }]);
  });

  it('eşzamanlı iki tarama aynı kanıtı bir kez sayar', { timeout: 45_000 }, async () => {
    const { mentor, student } = await repeatedPair();
    await scan();
    await extraEntry(mentor, student, new Date('2030-06-15T10:00:00Z'));
    await Promise.all([scan(), scan()]);
    expect((await flagsOf(mentor))[0]).toMatchObject({ recurrenceCount: 1 });
  });

  // Yarış testleri tam pakette büyük paylaşılan veritabanında iki tam tarama koşturur; yük altında 15 sn varsayılanı aşabilir (kart 170).
  it(
    'GERÇEK YARIŞ: iki tarama açık işareti aynı anda okur; satır kilidi ikincisini bekletir, kanıt bir kez sayılır',
    { timeout: 45_000 },
    async () => {
      const { mentor, student } = await repeatedPair();
      await scan();
      await extraEntry(mentor, student, new Date('2030-06-15T10:00:00Z'));
      // Bariyer: işaretin okunduğu noktada iki işlem de buraya gelirse (kilit yoksa) birlikte yazar. Kilit varsa ikincisi
      // kilitte bekler; bariyer 400 ms sonra serbest kalır ve ikinci işlem birincinin yazdığını görür.
      let arrived = 0;
      let open: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (open = resolve));
      const raced = new Proxy(db, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target) as unknown;
          if (prop !== '$transaction')
            return typeof value === 'function' ? value.bind(target) : value;
          return (fn: (tx: unknown) => Promise<unknown>, options?: unknown) =>
            (target.$transaction as (f: unknown, o?: unknown) => Promise<unknown>)(
              async (tx: typeof db) =>
                fn(
                  new Proxy(tx, {
                    get(inner, name) {
                      const member = Reflect.get(inner, name, inner) as unknown;
                      if (name !== 'suspicionFlag') {
                        return typeof member === 'function' ? member.bind(inner) : member;
                      }
                      return new Proxy(inner.suspicionFlag, {
                        get(model, method) {
                          const fnMember = Reflect.get(model, method, model) as unknown;
                          if (method !== 'findUniqueOrThrow') {
                            return typeof fnMember === 'function' ? fnMember.bind(model) : fnMember;
                          }
                          return async (...args: unknown[]) => {
                            const row = await (
                              fnMember as (...a: unknown[]) => Promise<unknown>
                            ).apply(model, args);
                            arrived += 1;
                            if (arrived >= 2) open();
                            await Promise.race([gate, new Promise((r) => setTimeout(r, 400))]);
                            return row;
                          };
                        },
                      });
                    },
                  }),
                ),
              options,
            );
        },
      }) as typeof db;
      const racedDeps = { ...deps, db: raced };
      await Promise.all([runSuspicionScan(racedDeps), runSuspicionScan(racedDeps)]);
      const [flag] = await flagsOf(mentor);
      expect(flag).toMatchObject({ recurrenceCount: 1 });
      expect(flag!.seenEvidenceKeys).toHaveLength(1);
      expect(flag!.recentEvidence as unknown[]).toHaveLength(1);
    },
  );

  it('özet en çok 5, tekrar anahtarı en çok 20 tutulur; sayaç sınırsız artar', async () => {
    const { mentor, student } = await repeatedPair();
    await scan();
    const [flag] = await flagsOf(mentor);
    await db.suspicionFlag.update({
      where: { id: flag!.id },
      data: {
        recurrenceCount: 40,
        seenEvidenceKeys: Array.from({ length: 20 }, (_, i) => `eski-${i}`),
        recentEvidence: Array.from({ length: 5 }, (_, i) => ({
          at: new Date(now.getTime() - (i + 1) * DAY).toISOString(),
          entryCount: i,
          points: i,
        })),
      },
    });
    await extraEntry(mentor, student, new Date('2030-06-15T10:00:00Z'));
    await scan();
    const [after] = await flagsOf(mentor);
    expect(after!.recurrenceCount).toBe(41);
    expect(after!.seenEvidenceKeys).toHaveLength(20);
    expect(after!.seenEvidenceKeys).not.toContain('eski-0'); // en eski düştü
    expect(after!.recentEvidence).toHaveLength(5);
    expect((after!.recentEvidence as { entryCount: number }[]).map((e) => e.entryCount)).toEqual([
      4, 0, 1, 2, 3,
    ]); // yeni başta; en eski (4) düştü
  });

  it('karar verilmiş + açık işaret birlikteyken yeni kanıt YALNIZ açık işarete sayılır', async () => {
    const { mentor, student } = await repeatedPair();
    await scan();
    const [first] = await flagsOf(mentor);
    await decideSuspicion(deps, admin, {
      flagId: first!.id,
      decision: 'DISMISS',
      reason: 'Gerçek',
    });
    await extraEntry(mentor, student, new Date('2030-06-15T10:00:00Z'));
    await scan(); // yeni açık işaret
    await extraEntry(mentor, student, new Date('2030-06-16T10:00:00Z'));
    await scan(); // açık işarete yeni kanıt
    const flags = await flagsOf(mentor);
    expect(flags).toHaveLength(2);
    expect(flags.find((f) => f.id === first!.id)).toMatchObject({
      status: 'DISMISSED',
      recurrenceCount: 0,
      lastSeenAt: null,
    });
    expect(flags.find((f) => f.id !== first!.id)).toMatchObject({
      status: 'OPEN',
      recurrenceCount: 1,
    });
  });

  it('karardan sonra yeni kanıt YENİ işaret açar (karar verilmiş işarete sayaç eklenmez)', async () => {
    const { mentor, student } = await repeatedPair();
    await scan();
    const [first] = await flagsOf(mentor);
    await decideSuspicion(deps, admin, {
      flagId: first!.id,
      decision: 'DISMISS',
      reason: 'Gerçek',
    });
    await extraEntry(mentor, student, new Date('2030-06-15T10:00:00Z'));
    const out = await scan();
    expect(out.flagged).toBe(1);
    const flags = await flagsOf(mentor);
    expect(flags).toHaveLength(2);
    expect(flags.find((f) => f.id === first!.id)).toMatchObject({
      status: 'DISMISSED',
      recurrenceCount: 0,
    });
    expect(flags.find((f) => f.id !== first!.id)).toMatchObject({
      status: 'OPEN',
      recurrenceCount: 0,
      entryCount: 4,
    });
  });

  it('aynı kanıt (değişmemiş) hiçbir şeyi artırmaz; farklı kural için ayrı işaret kendi sayacını tutar', async () => {
    const { mentor, student } = await repeatedPair(10_000); // SINGLE_COUNTERPART + SYNC_FEEDBACK
    await scan();
    await scan();
    expect((await flagsOf(mentor)).map((f) => f.recurrenceCount)).toEqual([0, 0]);
    await extraEntry(mentor, student, new Date('2030-06-15T10:00:00Z'));
    await scan();
    const flags = await flagsOf(mentor);
    const single = flags.find((f) => f.rule === 'SINGLE_COUNTERPART')!;
    const sync = flags.find((f) => f.rule === 'SYNC_FEEDBACK')!;
    expect(single.recurrenceCount).toBe(1); // yeni giriş tek karşı tarafın payını değiştirdi
    expect(sync.recurrenceCount).toBe(0); // senkron görüşme kanıtı değişmedi
  });

  it('yönetici listesi sayaç, son görülme ve özeti verir; kişisel veri/kimlik çıkmaz', async () => {
    const { mentor, student } = await repeatedPair();
    await scan();
    await extraEntry(mentor, student, new Date('2030-06-15T10:00:00Z'));
    await scan();
    const page = await listSuspicionFlags(deps, admin, { limit: 50 });
    const mine = page.items.find((i) => i.userId === mentor)!;
    expect(mine.details).toMatchObject({
      recurrenceCount: 1,
      lastSeenAt: now,
      recentEvidence: [{ at: now, entryCount: 4, points: 21 }],
    });
    const text = JSON.stringify(page);
    const flag = (await flagsOf(mentor))[0]!;
    for (const secret of [...flag.seenEvidenceKeys, flag.evidenceKey, student])
      expect(text).not.toContain(secret);
  });

  it('bozuk saklı özet listeyi bozmaz (boş liste sayılır)', async () => {
    const { mentor } = await repeatedPair();
    await scan();
    await db.suspicionFlag.updateMany({
      where: { userId: mentor },
      data: { recentEvidence: [{ yanlis: true }] },
    });
    const page = await listSuspicionFlags(deps, admin, { limit: 50 });
    expect(page.items.find((i) => i.userId === mentor)!.details.recentEvidence).toEqual([]);
  });
});

describe('şüphe kararı', () => {
  it('işaret varken bekleyen puan kesinleşmez; ret sonrası kesinleşir, puana dokunulmaz, aynı kanıt yeniden işaretlenmez', async () => {
    const { mentor, student } = await repeatedPair();
    await session(mentor, student, new Date(now.getTime() - 9 * DAY), 'IN_PERSON');
    await scan();
    const [flag] = await flagsOf(mentor);
    expect(flag).toBeTruthy();
    const later = { db, now: () => new Date(now.getTime() + 30 * DAY) };
    await finalizeDuePoints(later);
    const pending = () => db.pointEntry.count({ where: { userId: mentor, status: 'PENDING' } });
    // gecikmesi dolmuş yüz yüze görüşme: önce yazım anında FINAL olmuş olabilir; bekleyen bir kayıt kur
    await db.pointEntry.updateMany({
      where: { userId: mentor, action: 'SESSION_IN_PERSON' },
      data: { status: 'PENDING', finalizedAt: null, finalizesAt: new Date(now.getTime() - HOUR) },
    });
    expect(await pending()).toBe(1);
    await finalizeDuePoints(deps);
    expect(await pending()).toBe(1);

    const out = await decideSuspicion(deps, admin, {
      flagId: flag!.id,
      decision: 'DISMISS',
      reason: 'Gerçek mentorluk',
    });
    expect(out).toEqual({ flagId: flag!.id, status: 'DISMISSED', revokedCount: 0 });
    expect(await db.pointEntry.count({ where: { userId: mentor, status: 'REVOKED' } })).toBe(0);
    await finalizeDuePoints(deps);
    expect(await pending()).toBe(0);
    expect(await audit(flag!.id)).toMatchObject([
      { action: 'SUSPICION_DECIDE', targetType: 'SUSPICION_FLAG', reason: 'Gerçek mentorluk' },
    ]);
    await scan();
    expect((await flagsOf(mentor)).filter((f) => f.rule === 'SINGLE_COUNTERPART')).toHaveLength(1);
    expect(
      await code(
        decideSuspicion(deps, admin, { flagId: flag!.id, decision: 'CONFIRM', reason: 'Geç' }),
      ),
    ).toBe('SUSPICION_ALREADY_DECIDED');
  });

  it('onay: işarete bağlı kayıtlar geri alınır (FRAUD_CONFIRMED), kaynağı onlar olan etiket düşer, işlem kaydı yazılır', async () => {
    const { mentor } = await repeatedPair();
    const exp = await db.experience.create({
      data: {
        authorId: mentor,
        departmentIdAtWrite: inst.deptA1,
        type: 'INTERNSHIP',
        status: 'PUBLISHED',
        isAnonymous: false,
        organizationName: 'Kurum',
        termYear: 2026,
        termSeason: 'SUMMER',
        durationWeeks: 8,
        pay: 'PAID',
        applicationChannel: 'COMPANY_SITE',
        whatLearned: 'x',
        advice: 'y',
        moderatedById: admin,
        moderatedAt: now,
        publishedAt: new Date(now.getTime() - 60 * DAY),
      },
    });
    await awardForExperience(deps, exp.id);
    const expEntry = await db.pointEntry.findFirstOrThrow({
      where: { userId: mentor, action: 'EXPERIENCE_PUBLISHED' },
    });
    await scan();
    const flag = (await flagsOf(mentor)).find((f) => f.rule === 'SINGLE_COUNTERPART')!;
    // etiketin kaynağı işaret kapsamında DEĞİL: etiket kalır
    const out = await decideSuspicion(deps, admin, {
      flagId: flag.id,
      decision: 'CONFIRM',
      reason: 'Sahte görüşmeler',
    });
    expect(out).toEqual({ flagId: flag.id, status: 'CONFIRMED', revokedCount: 3 });
    const rows = await entriesOf(mentor);
    expect(rows.filter((r) => r.status === 'REVOKED')).toHaveLength(3);
    expect(
      rows
        .filter((r) => r.status === 'REVOKED')
        .every((r) => r.revokedReason === 'FRAUD_CONFIRMED' && r.revokedById === admin),
    ).toBe(true);
    expect(rows.find((r) => r.id === expEntry.id)!.status).toBe('FINAL');
    expect(await db.userBadge.count({ where: { userId: mentor, revokedAt: null } })).toBe(1);
    const decided = await db.suspicionFlag.findUniqueOrThrow({ where: { id: flag.id } });
    expect(decided).toMatchObject({ status: 'CONFIRMED', decidedById: admin });
    expect(decided.decidedAt).toEqual(now);
    expect((await audit(flag.id))[0]!.metadata).toMatchObject({
      rule: 'SINGLE_COUNTERPART',
      decision: 'CONFIRM',
      revokedCount: 3,
    });
  });

  it('onay, işarete bağlı kaynağı olan etiketi de düşürür', async () => {
    const mentor = await member('ALUMNI');
    const exp = await db.experience.create({
      data: {
        authorId: mentor,
        departmentIdAtWrite: inst.deptA1,
        type: 'INTERNSHIP',
        status: 'PUBLISHED',
        isAnonymous: false,
        organizationName: 'Kurum',
        termYear: 2026,
        termSeason: 'SUMMER',
        durationWeeks: 8,
        pay: 'PAID',
        applicationChannel: 'COMPANY_SITE',
        whatLearned: 'x',
        advice: 'y',
        moderatedById: admin,
        moderatedAt: now,
        publishedAt: now,
      },
    });
    await awardForExperience(deps, exp.id);
    const entry = await db.pointEntry.findFirstOrThrow({ where: { userId: mentor } });
    const flag = await db.suspicionFlag.create({
      data: {
        userId: mentor,
        rule: 'BURST',
        evidenceKey: `k-${mentor}`,
        entryIds: [entry.id],
        windowStart: now,
        windowEnd: now,
        entryCount: 1,
        points: 5,
      },
    });
    const out = await decideSuspicion(deps, admin, {
      flagId: flag.id,
      decision: 'CONFIRM',
      reason: 'Etiket sahte',
    });
    expect(out.revokedCount).toBe(1);
    expect(await db.userBadge.count({ where: { userId: mentor, revokedAt: null } })).toBe(0);
  });

  it('onayda zaten geri alınmış kayıt yeniden damgalanmaz ve sayıya girmez', async () => {
    const { mentor } = await repeatedPair();
    await scan();
    const flag = (await flagsOf(mentor))[0]!;
    const [first] = await entriesOf(mentor);
    await revokePointEntry(deps, admin, { entryId: first!.id, reason: 'Önce elle' });
    const stamped = (await db.pointEntry.findUniqueOrThrow({ where: { id: first!.id } })).revokedAt;
    const later = { ...deps, now: () => new Date(now.getTime() + HOUR) };
    const out = await decideSuspicion(later, admin, {
      flagId: flag.id,
      decision: 'CONFIRM',
      reason: 'Kalanlar da sahte',
    });
    expect(out.revokedCount).toBe(2);
    const after = await db.pointEntry.findUniqueOrThrow({ where: { id: first!.id } });
    expect(after).toMatchObject({ revokedReason: 'ADMIN_CANCEL' });
    expect(after.revokedAt).toEqual(stamped);
  });

  it('eşzamanlı iki karardan yalnız biri uygulanır; yetkisiz ve bilinmeyen işaret reddedilir', async () => {
    const { mentor } = await repeatedPair();
    await scan();
    const flag = (await flagsOf(mentor))[0]!;
    const results = await Promise.all([
      code(
        decideSuspicion(deps, admin, { flagId: flag.id, decision: 'CONFIRM', reason: 'Birinci' }),
      ),
      code(
        decideSuspicion(deps, admin, { flagId: flag.id, decision: 'DISMISS', reason: 'İkinci' }),
      ),
    ]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(results.filter((r) => r === 'SUSPICION_ALREADY_DECIDED')).toHaveLength(1);
    expect(await audit(flag.id)).toHaveLength(1);
    expect(
      await code(
        decideSuspicion(deps, mentor, { flagId: flag.id, decision: 'DISMISS', reason: 'Ben' }),
      ),
    ).toBe('AUTH_FORBIDDEN');
    expect(
      await code(
        decideSuspicion(deps, admin, { flagId: 'yok', decision: 'DISMISS', reason: 'Yok' }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
  });

  it('işaret listesi ad ve sayılar gösterir; kanıt/kayıt kimliği ve karşı taraf çıkmaz; duruma göre süzülür', async () => {
    const { mentor, student } = await repeatedPair();
    await scan();
    const all = await listSuspicionFlags(deps, admin, { limit: 50 });
    const mine = all.items.find((i) => i.userId === mentor)!;
    expect(mine).toMatchObject({
      displayName: 'Test Kullanıcı',
      rule: 'SINGLE_COUNTERPART',
      status: 'OPEN',
      decidedAt: null,
      details: { entryCount: 3, points: 17, sharePercent: 100, syncedCount: null },
    });
    const text = JSON.stringify(all);
    const flag = (await flagsOf(mentor))[0]!;
    for (const secret of [flag.evidenceKey, student, ...flag.entryIds])
      expect(text).not.toContain(secret);
    expect(
      (await listSuspicionFlags(deps, admin, { status: 'CONFIRMED', limit: 50 })).items.some(
        (i) => i.userId === mentor,
      ),
    ).toBe(false);
    const first = await listSuspicionFlags(deps, admin, { limit: 1 });
    expect(first.nextCursor).not.toBeNull();
    expect(await code(listSuspicionFlags(deps, mentor, {}))).toBe('AUTH_FORBIDDEN');
  });
});

describe('geriye dönük hesaplama isteği', () => {
  it('işlem kaydı yazar ve işi kuyruğa alır; yetkisiz çağrıda kuyruğa dokunulmaz', async () => {
    const enqueueBackfill = vi.fn(async () => undefined);
    const before = await db.adminAuditLog.count({ where: { action: 'POINTS_BACKFILL' } });
    expect(await requestPointBackfill({ ...deps, enqueueBackfill }, admin, {})).toEqual({
      queued: true,
    });
    expect(enqueueBackfill).toHaveBeenCalledTimes(1);
    expect(await db.adminAuditLog.count({ where: { action: 'POINTS_BACKFILL' } })).toBe(before + 1);
    const plain = await member();
    expect(await code(requestPointBackfill({ ...deps, enqueueBackfill }, plain, {}))).toBe(
      'AUTH_FORBIDDEN',
    );
    expect(enqueueBackfill).toHaveBeenCalledTimes(1);
    expect(
      await code(requestPointBackfill({ ...deps, enqueueBackfill }, admin, { x: 1 } as never)),
    ).toBe('ZodError');
  });

  it('kuyruk hata verirse POINT_BACKFILL_UNAVAILABLE döner ve istek kaydı kalır', async () => {
    const before = await db.adminAuditLog.count({ where: { action: 'POINTS_BACKFILL' } });
    const broken = vi.fn(async () => {
      throw new Error('bağlantı: postgres://gizli');
    });
    expect(await code(requestPointBackfill({ ...deps, enqueueBackfill: broken }, admin, {}))).toBe(
      'POINT_BACKFILL_UNAVAILABLE',
    );
    expect(await db.adminAuditLog.count({ where: { action: 'POINTS_BACKFILL' } })).toBe(before + 1);
  });
});

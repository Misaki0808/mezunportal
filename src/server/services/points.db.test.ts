import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PointAction } from '@/contracts/points';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
  type Institution,
} from '@/test/fixtures';

import { createMemoryStorage } from '../external/storage';
import { deleteAccount } from './accountDeletion';
import { markHelpful } from './cv-review-request';
import { buildDataExport } from './dataExport';
import { reviewExperience } from './experience';
import { submitFeedback } from './feedback';
import {
  awardForCvReview,
  awardForExperience,
  awardForSession,
  awardPoint,
  awardSafely,
  finalizeDuePoints,
  getMyContribution,
  runDailyPoints,
  runPointBackfill,
} from './points';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date('2030-06-20T12:00:00Z');
let inst: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
  // Kural tablosu seed'ten gelir; test veritabanında yoksa başlangıç değerlerini kur.
  const { seedPointRules } = await import('../../../prisma/seed-points');
  await seedPointRules(db);
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
async function pair() {
  return { mentor: await member('ALUMNI'), student: await member() };
}
const entriesOf = (userId: string) =>
  db.pointEntry.findMany({ where: { userId }, orderBy: { eventAt: 'asc' } });

/** Görüşme: iki taraf da "gerçekleşti" dedi, durum `COMPLETED` (aynı mentor aralıkları çakışmasın diye saatler ayrı). */
async function completedSession(
  mentor: string,
  student: string,
  startsAt: Date,
  mode: 'ONLINE' | 'IN_PERSON' = 'ONLINE',
  feedbackGapMs = 5 * 60_000,
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
        createdAt: new Date(at.getTime() + feedbackGapMs),
      },
    ],
  });
  return row;
}
async function publishedExperience(
  author: string,
  moderator: string,
  publishedAt: Date,
  isAnonymous = false,
) {
  return db.experience.create({
    data: {
      authorId: author,
      departmentIdAtWrite: inst.deptA1,
      type: 'INTERNSHIP',
      status: 'PUBLISHED',
      isAnonymous,
      organizationName: 'Kurum',
      termYear: 2026,
      termSeason: 'SUMMER',
      durationWeeks: 8,
      pay: 'PAID',
      applicationChannel: 'COMPANY_SITE',
      whatLearned: 'Çok şey',
      advice: 'Başvur',
      moderatedById: moderator,
      moderatedAt: publishedAt,
      publishedAt,
    },
  });
}
const deps = { db, now: () => now, foundingUntil: null };

describe('deneyim puanı ve kurucu üye etiketi (K-10)', () => {
  it('yayında 5 puan; ikinci çağrı tek kayıt; ilk adlı deneyim etiket verir, ikincisi vermez', async () => {
    const author = await member();
    const moderator = await member();
    const first = await publishedExperience(author, moderator, new Date('2030-06-01T10:00:00Z'));
    const second = await publishedExperience(author, moderator, new Date('2030-06-02T10:00:00Z'));
    expect(await awardForExperience(deps, first.id)).toMatchObject({ created: true });
    expect(await awardForExperience(deps, first.id)).toMatchObject({
      created: false,
      skipped: 'DUPLICATE',
    });
    await awardForExperience(deps, second.id);
    const rows = await entriesOf(author);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      action: 'EXPERIENCE_PUBLISHED',
      sourceType: 'EXPERIENCE',
      basePoints: 5,
      multiplierPercent: 100,
      points: 5,
      status: 'FINAL',
      counterpartId: null,
    });
    const badges = await db.userBadge.findMany({ where: { userId: author } });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ kind: 'FOUNDING_MEMBER', sourceEntryId: rows[0]!.id });
  });

  it('anonim deneyim puan verir ama etiket vermez; sonraki adlı deneyim etiketi verir', async () => {
    const author = await member();
    const moderator = await member();
    const anonymous = await publishedExperience(
      author,
      moderator,
      new Date('2030-06-01T10:00:00Z'),
      true,
    );
    await awardForExperience(deps, anonymous.id);
    expect(await entriesOf(author)).toHaveLength(1);
    expect(await db.userBadge.count({ where: { userId: author } })).toBe(0);
    const named = await publishedExperience(author, moderator, new Date('2030-06-03T10:00:00Z'));
    await awardForExperience(deps, named.id);
    expect(await db.userBadge.count({ where: { userId: author } })).toBe(1);
  });

  it('pilot bitişinden sonra yayınlanan deneyim etiket doğurmaz (bitiş günü dahil)', async () => {
    const moderator = await member();
    const late = await member();
    const onLastDay = await member();
    const until = new Date('2030-06-10T20:59:59.999Z');
    const lateRow = await publishedExperience(late, moderator, new Date(until.getTime() + 1));
    const lastDayRow = await publishedExperience(onLastDay, moderator, until);
    await awardForExperience({ ...deps, foundingUntil: until }, lateRow.id);
    await awardForExperience({ ...deps, foundingUntil: until }, lastDayRow.id);
    expect(await entriesOf(late)).toHaveLength(1);
    expect(await db.userBadge.count({ where: { userId: late } })).toBe(0);
    expect(await db.userBadge.count({ where: { userId: onLastDay } })).toBe(1);
  });

  it('yayınlanmamış, yazarsız ya da askıdaki yazarın deneyimi puan üretmez', async () => {
    const moderator = await member();
    const suspended = await member();
    const row = await publishedExperience(suspended, moderator, new Date('2030-06-01T10:00:00Z'));
    const pending = await db.experience.create({
      data: {
        authorId: suspended,
        departmentIdAtWrite: inst.deptA1,
        type: 'INTERNSHIP',
        status: 'PENDING',
        isAnonymous: false,
        organizationName: 'Kurum',
        termYear: 2026,
        termSeason: 'SUMMER',
        durationWeeks: 8,
        pay: 'PAID',
        applicationChannel: 'COMPANY_SITE',
        whatLearned: 'x',
        advice: 'y',
      },
    });
    expect(await awardForExperience(deps, pending.id)).toBeNull();
    expect(await awardForExperience(deps, 'olmayan-kimlik')).toBeNull();
    await db.user.update({ where: { id: suspended }, data: { banned: true, banExpires: null } });
    expect(await awardForExperience(deps, row.id)).toMatchObject({
      created: false,
      skipped: 'RECIPIENT_INELIGIBLE',
    });
    // askı süresi dolunca uzlaştırma puanı tamamlar
    await db.user.update({
      where: { id: suspended },
      data: { banExpires: new Date(now.getTime() - 1) },
    });
    expect(await awardForExperience(deps, row.id)).toMatchObject({ created: true });
  });

  it('moderasyon yayını (kanca) puanı yazar; ret yazmaz', async () => {
    const author = await member();
    const moderator = await member();
    await addGrant(db, { userId: moderator, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    const make = () =>
      db.experience.create({
        data: {
          authorId: author,
          departmentIdAtWrite: inst.deptA1,
          type: 'INTERNSHIP',
          status: 'PENDING',
          isAnonymous: false,
          organizationName: 'Kurum',
          termYear: 2026,
          termSeason: 'SUMMER',
          durationWeeks: 8,
          pay: 'PAID',
          applicationChannel: 'COMPANY_SITE',
          whatLearned: 'x',
          advice: 'y',
        },
      });
    const [a, b] = [await make(), await make()];
    await reviewExperience(db, moderator, { experienceId: a.id, decision: 'PUBLISH' });
    await reviewExperience(db, moderator, {
      experienceId: b.id,
      decision: 'REJECT',
      reason: 'Uygun değil',
    });
    const rows = await entriesOf(author);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'EXPERIENCE_PUBLISHED', points: 5 });
  });
});

describe('görüşme puanı: iki taraf şartı, ikili tavanı, azalan çarpan, gecikme', () => {
  it('iki taraf onaylı online görüşme mentora 10 puan (öğrenciye puan yok); tekrar tek kayıt', async () => {
    const { mentor, student } = await pair();
    const session = await completedSession(mentor, student, new Date('2030-06-10T10:00:00Z'));
    expect(await awardForSession(deps, session.id)).toMatchObject({ created: true });
    expect(await awardForSession(deps, session.id)).toMatchObject({ skipped: 'DUPLICATE' });
    const rows = await entriesOf(mentor);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'SESSION_ONLINE',
      sourceType: 'APPOINTMENT',
      sourceId: session.id,
      counterpartId: student,
      points: 10,
      multiplierPercent: 100,
      status: 'FINAL',
    });
    expect(await entriesOf(student)).toHaveLength(0);
  });

  it('tek taraf onayı, CONFIRMED/NO_SHOW durumu ya da "gerçekleşmedi" yanıtı puan üretmez', async () => {
    const { mentor, student } = await pair();
    const session = await completedSession(mentor, student, new Date('2030-06-10T10:00:00Z'));
    await db.sessionFeedback.update({
      where: { appointmentId_authorId: { appointmentId: session.id, authorId: student } },
      data: { happened: false },
    });
    expect(await awardForSession(deps, session.id)).toBeNull();
    await db.sessionFeedback.delete({
      where: { appointmentId_authorId: { appointmentId: session.id, authorId: student } },
    });
    expect(await awardForSession(deps, session.id)).toBeNull();
    await db.sessionFeedback.create({
      data: { appointmentId: session.id, authorId: student, happened: true },
    });
    for (const status of ['CONFIRMED', 'NO_SHOW'] as const) {
      await db.appointment.update({ where: { id: session.id }, data: { status } });
      expect(await awardForSession(deps, session.id)).toBeNull();
    }
    expect(await entriesOf(mentor)).toHaveLength(0);
    expect(await awardForSession(deps, 'olmayan-kimlik')).toBeNull();
  });

  it('aynı ay ikinci görüşme çarpan 0 ile kaydedilir; sonraki aylarda 50 ve 25', async () => {
    const { mentor, student } = await pair();
    const dates = [
      '2030-03-10T10:00:00Z',
      '2030-03-20T10:00:00Z', // aynı ay → 0
      '2030-04-10T10:00:00Z', // 1 önceki → 50
      '2030-05-10T10:00:00Z', // 2 önceki → 25
      '2030-06-10T10:00:00Z', // 3 önceki → 25
    ];
    for (const iso of dates) {
      const session = await completedSession(mentor, student, new Date(iso));
      await awardForSession(deps, session.id);
    }
    const rows = await entriesOf(mentor);
    expect(rows.map((r) => r.multiplierPercent)).toEqual([100, 0, 50, 25, 25]);
    expect(rows.map((r) => r.points)).toEqual([10, 0, 5, 2, 2]);
    expect(rows.every((r) => r.basePoints === 10)).toBe(true);
  });

  it('farklı öğrenciyle aynı ay görüşme ayrı ikilidir (tavan ikiliye özgü)', async () => {
    const { mentor, student } = await pair();
    const other = await member();
    const a = await completedSession(mentor, student, new Date('2030-06-10T10:00:00Z'));
    const b = await completedSession(mentor, other, new Date('2030-06-12T10:00:00Z'));
    await awardForSession(deps, a.id);
    await awardForSession(deps, b.id);
    expect((await entriesOf(mentor)).map((r) => r.points)).toEqual([10, 10]);
  });

  it('eşzamanlı iki tamamlanmada aynı ay yalnız biri puan alır', async () => {
    const { mentor, student } = await pair();
    const a = await completedSession(mentor, student, new Date('2030-06-05T10:00:00Z'));
    const b = await completedSession(mentor, student, new Date('2030-06-06T10:00:00Z'));
    await Promise.all([awardForSession(deps, a.id), awardForSession(deps, b.id)]);
    const rows = await entriesOf(mentor);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.multiplierPercent).sort()).toEqual([0, 100]);
  });

  it('ay sınırı İstanbul saatine göredir', async () => {
    const { mentor, student } = await pair();
    // 31 Mayıs 23:30 İstanbul = 20:30Z (Mayıs); 1 Haziran 00:30 İstanbul = 21:30Z (Haziran)
    const may = await completedSession(mentor, student, new Date('2030-05-31T20:30:00Z'));
    const june = await completedSession(mentor, student, new Date('2030-05-31T21:30:00Z'));
    await awardForSession(deps, may.id);
    await awardForSession(deps, june.id);
    expect((await entriesOf(mentor)).map((r) => r.multiplierPercent)).toEqual([100, 50]);
  });

  it('geri alınan görüşme ayın hakkını serbest bırakır', async () => {
    const { mentor, student } = await pair();
    const a = await completedSession(mentor, student, new Date('2030-06-05T10:00:00Z'));
    const b = await completedSession(mentor, student, new Date('2030-06-06T10:00:00Z'));
    await awardForSession(deps, a.id);
    await db.pointEntry.updateMany({
      where: { userId: mentor },
      data: { status: 'REVOKED', revokedAt: now, revokedReason: 'ADMIN_CANCEL' },
    });
    await awardForSession(deps, b.id);
    const rows = await entriesOf(mentor);
    expect(rows.map((r) => [r.status, r.multiplierPercent])).toEqual([
      ['REVOKED', 100],
      ['FINAL', 100],
    ]);
  });

  it('yüz yüze görüşme 15 puan ve 7 gün gecikmeli: süre dolmadan PENDING, dolunca FINAL', async () => {
    const { mentor, student } = await pair();
    const start = new Date(now.getTime() - 3 * DAY);
    const session = await completedSession(mentor, student, start, 'IN_PERSON');
    await awardForSession(deps, session.id);
    const [entry] = await entriesOf(mentor);
    expect(entry).toMatchObject({
      action: 'SESSION_IN_PERSON',
      basePoints: 15,
      points: 15,
      status: 'PENDING',
      finalizesAt: new Date(start.getTime() + 7 * DAY),
      finalizedAt: null,
    });
    await finalizeDuePoints(deps);
    expect((await entriesOf(mentor))[0]!.status).toBe('PENDING');
    const due = new Date(start.getTime() + 7 * DAY);
    const result = await finalizeDuePoints({ db, now: () => due });
    expect(result.finalized).toBeGreaterThanOrEqual(1);
    expect((await entriesOf(mentor))[0]).toMatchObject({ status: 'FINAL', finalizedAt: due });
    expect((await finalizeDuePoints({ db, now: () => due })).finalized).toBe(0);
  });

  it('gecikmesi çoktan dolmuş geçmiş görüşme doğrudan FINAL yazılır', async () => {
    const { mentor, student } = await pair();
    const session = await completedSession(
      mentor,
      student,
      new Date(now.getTime() - 30 * DAY),
      'IN_PERSON',
    );
    await awardForSession(deps, session.id);
    expect((await entriesOf(mentor))[0]).toMatchObject({ status: 'FINAL', finalizedAt: now });
  });

  it('görüşme tamamlanınca (kanca) iki tarafın formundan puan yazılır', async () => {
    const { mentor, student } = await pair();
    const start = new Date(now.getTime() - 5 * HOUR);
    const row = await db.appointment.create({
      data: {
        mentorId: mentor,
        menteeId: student,
        startsAt: start,
        endsAt: new Date(start.getTime() + HOUR),
        expiresAt: new Date(start.getTime() - DAY),
        decidedAt: new Date(start.getTime() - DAY),
        mode: 'ONLINE',
        status: 'CONFIRMED',
      },
    });
    const input = { appointmentId: row.id, happened: true, helpful: true, note: null };
    await submitFeedback(db, student, input, now);
    expect(await entriesOf(mentor)).toHaveLength(0); // yalnız bir taraf
    await submitFeedback(db, mentor, input, now);
    const rows = await entriesOf(mentor);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceId: row.id, points: 10 });
  });

  it('mentor "gerçekleşmedi" derse NO_SHOW olur ve puan yazılmaz', async () => {
    const { mentor, student } = await pair();
    const start = new Date(now.getTime() - 5 * HOUR);
    const row = await db.appointment.create({
      data: {
        mentorId: mentor,
        menteeId: student,
        startsAt: start,
        endsAt: new Date(start.getTime() + HOUR),
        expiresAt: new Date(start.getTime() - DAY),
        decidedAt: new Date(start.getTime() - DAY),
        mode: 'ONLINE',
        status: 'CONFIRMED',
      },
    });
    await submitFeedback(
      db,
      mentor,
      { appointmentId: row.id, happened: false, helpful: null, note: null },
      now,
    );
    await submitFeedback(
      db,
      student,
      { appointmentId: row.id, happened: true, helpful: true, note: null },
      now,
    );
    expect(await entriesOf(mentor)).toHaveLength(0);
  });
});

describe('CV incelemesi puanı', () => {
  async function review(mentor: string, student: string, helpfulAt: Date | null) {
    const cv = await db.cvUpload.create({
      data: {
        userId: student,
        storageKey: `cv/${student}/${Math.random().toString(36).slice(2)}.pdf`,
        byteSize: 9,
        pageCount: 1,
        status: 'APPLIED',
        appliedAt: now,
      },
    });
    return db.cvReviewRequest.create({
      data: {
        studentId: student,
        mentorId: mentor,
        cvUploadId: cv.id,
        note: 'Bakar mısın',
        comment: 'Şunu ekle',
        status: 'COMPLETED',
        expiresAt: new Date(now.getTime() + DAY),
        answeredAt: now,
        helpfulAt,
      },
    });
  }
  it('yalnız "faydalı" işaretli tamamlanmış inceleme mentora 3 puan verir; tekrar tek kayıt', async () => {
    const { mentor, student } = await pair();
    const unhelpful = await review(mentor, student, null);
    expect(await awardForCvReview(deps, unhelpful.id)).toBeNull();
    const row = await review(mentor, student, new Date('2030-06-18T10:00:00Z'));
    expect(await awardForCvReview(deps, row.id)).toMatchObject({ created: true });
    expect(await awardForCvReview(deps, row.id)).toMatchObject({ skipped: 'DUPLICATE' });
    expect(await entriesOf(mentor)).toMatchObject([
      { action: 'CV_REVIEW_HELPFUL', sourceType: 'CV_REVIEW', points: 3, counterpartId: student },
    ]);
    await db.cvReviewRequest.update({ where: { id: row.id }, data: { status: 'OPEN' } });
    const other = await review(mentor, student, new Date('2030-06-18T10:00:00Z'));
    await db.cvReviewRequest.update({ where: { id: other.id }, data: { status: 'EXPIRED' } });
    expect(await awardForCvReview(deps, other.id)).toBeNull();
    expect(await awardForCvReview(deps, 'olmayan-kimlik')).toBeNull();
  });

  it('öğrenci "faydalı" dediğinde (kanca) puan yazılır', async () => {
    const { mentor, student } = await pair();
    const row = await review(mentor, student, null);
    await markHelpful({ db, storage: createMemoryStorage(), now: () => now }, student, row.id);
    expect(await entriesOf(mentor)).toMatchObject([{ action: 'CV_REVIEW_HELPFUL', points: 3 }]);
  });
});

describe('kural tablosu ve alıcı uygunluğu', () => {
  it('pasif ya da 0 puanlı kural kayıt üretmez; kural değişikliği yalnız yeni kayıtları etkiler', async () => {
    const { mentor, student } = await pair();
    const a = await completedSession(mentor, student, new Date('2030-04-10T10:00:00Z'));
    const b = await completedSession(mentor, student, new Date('2030-05-10T10:00:00Z'));
    const c = await completedSession(mentor, student, new Date('2030-06-10T10:00:00Z'));
    try {
      await awardForSession(deps, a.id);
      await db.pointRule.update({ where: { action: 'SESSION_ONLINE' }, data: { points: 20 } });
      await awardForSession(deps, b.id);
      await db.pointRule.update({ where: { action: 'SESSION_ONLINE' }, data: { isActive: false } });
      expect(await awardForSession(deps, c.id)).toMatchObject({ skipped: 'RULE_INACTIVE' });
      await db.pointRule.update({
        where: { action: 'SESSION_ONLINE' },
        data: { isActive: true, points: 0 },
      });
      expect(await awardForSession(deps, c.id)).toMatchObject({ skipped: 'RULE_INACTIVE' });
    } finally {
      await db.pointRule.update({
        where: { action: 'SESSION_ONLINE' },
        data: { points: 10, isActive: true },
      });
    }
    const rows = await entriesOf(mentor);
    expect(rows.map((r) => [r.basePoints, r.multiplierPercent, r.points])).toEqual([
      [10, 100, 10],
      [20, 50, 10],
    ]);
  });

  it('kural satırı hiç yoksa kayıt üretmez', async () => {
    const author = await member();
    const res = await db.$transaction((tx) =>
      awardPoint(
        tx,
        {
          userId: author,
          action: 'FAQ_ANSWER_SELECTED',
          sourceType: 'FAQ_ANSWER',
          sourceId: 'x1',
          eventAt: now,
        },
        now,
      ),
    );
    expect(res).toMatchObject({ created: true, skipped: null });
    await db.pointRule.delete({ where: { action: 'FAQ_QUESTION_PUBLISHED' } });
    try {
      const none = await db.$transaction((tx) =>
        awardPoint(
          tx,
          {
            userId: author,
            action: 'FAQ_QUESTION_PUBLISHED' as PointAction,
            sourceType: 'FAQ_REQUEST',
            sourceId: 'x2',
            eventAt: now,
          },
          now,
        ),
      );
      expect(none).toMatchObject({ created: false, skipped: 'RULE_INACTIVE' });
    } finally {
      await db.pointRule.create({
        data: { action: 'FAQ_QUESTION_PUBLISHED', points: 2, delayDays: 0 },
      });
    }
  });

  it('silinmiş ya da süresiz askıdaki alıcı puan almaz', async () => {
    const { mentor, student } = await pair();
    const session = await completedSession(mentor, student, new Date('2030-06-10T10:00:00Z'));
    await db.user.update({ where: { id: mentor }, data: { banned: true, banExpires: null } });
    expect(await awardForSession(deps, session.id)).toMatchObject({
      skipped: 'RECIPIENT_INELIGIBLE',
    });
    await db.user.update({
      where: { id: mentor },
      data: { banned: false, deletedAt: new Date(now.getTime() - DAY) },
    });
    expect(await awardForSession(deps, session.id)).toMatchObject({
      skipped: 'RECIPIENT_INELIGIBLE',
    });
    expect(await entriesOf(mentor)).toHaveLength(0);
  });

  it('awardSafely hatayı yutar ve kullanıcı akışını bozmaz', async () => {
    await expect(
      awardSafely(async () => {
        throw new Error('gizli ayrıntı');
      }),
    ).resolves.toBeUndefined();
  });
});

describe('geriye dönük hesaplama ve günlük uzlaştırma', () => {
  it('geçmiş yayın/görüşme/inceleme için kayıt yazar; ikinci çalıştırma sonucu DEĞİŞTİRMEZ', async () => {
    const author = await member();
    const moderator = await member();
    const { mentor, student } = await pair();
    // Olay kancaları atlanarak (puan motoru devreye girmeden önceki veri) doğrudan yazılmış kayıtlar:
    const exp = await publishedExperience(author, moderator, new Date('2030-05-01T10:00:00Z'));
    const s1 = await completedSession(mentor, student, new Date('2030-04-10T10:00:00Z'));
    const s2 = await completedSession(mentor, student, new Date('2030-04-20T10:00:00Z'));
    const s3 = await completedSession(
      mentor,
      student,
      new Date('2030-05-10T10:00:00Z'),
      'IN_PERSON',
    );
    const since = new Date('2030-04-01T00:00:00Z');
    const first = await runPointBackfill(deps, { since });
    expect(first.failed).toBe(0);
    expect(first.created).toBeGreaterThanOrEqual(4);
    const snapshot = async () => ({
      author: (await entriesOf(author)).map((r) => [r.sourceId, r.points, r.status]),
      mentor: (await entriesOf(mentor)).map((r) => [
        r.sourceId,
        r.multiplierPercent,
        r.points,
        r.status,
      ]),
      badges: await db.userBadge.count({ where: { userId: author } }),
    });
    const before = await snapshot();
    const second = await runPointBackfill(deps, { since });
    expect(second.created).toBe(0);
    expect(await snapshot()).toEqual(before);
    expect(before.author).toEqual([[exp.id, 5, 'FINAL']]);
    // olay sırasıyla işlenir: Nisan'ın ilk görüşmesi 100, ikincisi (aynı ay) 0, Mayıs yüz yüze 50 (1 önceki) ve süresi dolmuş
    expect(before.mentor).toEqual([
      [s1.id, 100, 10, 'FINAL'],
      [s2.id, 0, 0, 'FINAL'],
      [s3.id, 50, 7, 'FINAL'],
    ]);
  });

  it('günlük iş: kaçırılan puanı tamamlar ve bekleyeni kesinleştirir', async () => {
    const { mentor, student } = await pair();
    const recent = await completedSession(
      mentor,
      student,
      new Date(now.getTime() - 2 * DAY),
      'IN_PERSON',
    );
    const old = await completedSession(mentor, student, new Date(now.getTime() - 40 * DAY));
    const first = await runDailyPoints(deps);
    expect(first.reconcile.failed).toBe(0);
    expect((await entriesOf(mentor)).map((r) => r.sourceId)).toEqual([recent.id]); // 14 gün dışı eski olay uzlaştırılmaz
    const later = { ...deps, now: () => new Date(now.getTime() + 6 * DAY) };
    const second = await runDailyPoints(later);
    expect(second.finalized).toBeGreaterThanOrEqual(1);
    expect((await entriesOf(mentor))[0]!.status).toBe('FINAL');
    void old;
  });
});

describe('katkı özeti ve geçmiş (yalnız sahibi)', () => {
  it('toplam yalnız FINAL; bekleyen ayrı; geri alınmış sayılmaz; çıktıda kaynak/karşı taraf yok', async () => {
    const { mentor, student } = await pair();
    const online = await completedSession(mentor, student, new Date('2030-04-10T10:00:00Z'));
    const person = await completedSession(
      mentor,
      student,
      new Date(now.getTime() - DAY),
      'IN_PERSON',
    );
    const cancelled = await completedSession(mentor, student, new Date('2030-05-10T10:00:00Z'));
    for (const s of [online, person, cancelled]) await awardForSession(deps, s.id);
    await db.pointEntry.updateMany({
      where: { userId: mentor, sourceId: cancelled.id },
      data: { status: 'REVOKED', revokedAt: now, revokedReason: 'FRAUD_CONFIRMED' },
    });
    const overview = await getMyContribution(deps, mentor, {});
    expect(overview.summary).toMatchObject({ total: 10, pending: 7, badges: [] });
    expect(overview.history.items).toHaveLength(3);
    const serialized = JSON.stringify(overview);
    for (const secret of [student, online.id, 'sourceId', 'counterpart', mentor])
      expect(serialized).not.toContain(secret);
    const pendingItem = overview.history.items.find((i) => i.status === 'PENDING')!;
    expect(pendingItem.finalizesAt).toBeInstanceOf(Date);
    const finalItem = overview.history.items.find((i) => i.status === 'FINAL')!;
    expect(finalItem.finalizesAt).toBeNull();
    const revoked = overview.history.items.find((i) => i.status === 'REVOKED')!;
    expect(revoked).toMatchObject({ revokedReason: 'FRAUD_CONFIRMED', finalizesAt: null });
    const filtered = await getMyContribution(deps, mentor, { status: 'REVOKED' });
    expect(filtered.history.items).toHaveLength(1);
    expect(await getMyContribution(deps, student, {})).toMatchObject({
      summary: { total: 0, pending: 0 },
      history: { items: [], nextCursor: null },
    });
  });

  it('geçmiş sayfalanır (en yeniden eskiye); aralık dışı limit reddedilir; iptal edilen etiket görünmez', async () => {
    const author = await member();
    const moderator = await member();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const row = await publishedExperience(
        author,
        moderator,
        new Date(`2030-06-0${i + 1}T10:00:00Z`),
      );
      await awardForExperience(deps, row.id);
      ids.push(row.id);
    }
    const page1 = await getMyContribution(deps, author, { limit: 2 });
    expect(page1.history.items).toHaveLength(2);
    expect(page1.history.nextCursor).not.toBeNull();
    const page2 = await getMyContribution(deps, author, {
      limit: 2,
      cursor: page1.history.nextCursor!,
    });
    expect(page2.history.items).toHaveLength(1);
    expect(page2.history.nextCursor).toBeNull();
    expect(page1.summary).toMatchObject({ total: 15, badges: [{ kind: 'FOUNDING_MEMBER' }] });
    await db.userBadge.updateMany({ where: { userId: author }, data: { revokedAt: now } });
    expect((await getMyContribution(deps, author, {})).summary.badges).toEqual([]);
    await expect(getMyContribution(deps, author, { limit: 51 })).rejects.toThrow();
  });
});

describe('hesap silme ve veri dökümü', () => {
  it('veri dökümü puan/etiket/işaretleri kaynak ve karşı taraf kimliği olmadan içerir', async () => {
    const { mentor, student } = await pair();
    const session = await completedSession(mentor, student, new Date('2030-06-10T10:00:00Z'));
    await awardForSession(deps, session.id);
    const moderator = await member();
    const exp = await publishedExperience(mentor, moderator, new Date('2030-06-01T10:00:00Z'));
    await awardForExperience(deps, exp.id);
    const dump = await buildDataExport(db, mentor);
    expect(dump.contribution.entries).toHaveLength(2);
    expect(dump.contribution.badges).toHaveLength(1);
    const text = JSON.stringify(dump.contribution);
    expect(text).not.toContain(student);
    expect(text).not.toContain(session.id);
    expect(text).not.toContain(exp.id);
    expect((await buildDataExport(db, student)).contribution.entries).toEqual([]);
  });

  it('hesap silince puan kayıtları, etiketler ve işaretler silinir; başkasının kaydındaki karşı taraf bağı kopar', async () => {
    const { mentor, student } = await pair();
    const session = await completedSession(mentor, student, new Date('2030-06-10T10:00:00Z'));
    await awardForSession(deps, session.id);
    const moderator = await member();
    const exp = await publishedExperience(student, moderator, new Date('2030-06-01T10:00:00Z'));
    await awardForExperience(deps, exp.id);
    await db.suspicionFlag.create({
      data: {
        userId: student,
        rule: 'BURST',
        evidenceKey: `k-${student}`,
        entryIds: [],
        windowStart: now,
        windowEnd: now,
        entryCount: 0,
        points: 0,
      },
    });
    const { email } = await db.user.findUniqueOrThrow({
      where: { id: student },
      select: { email: true },
    });
    await deleteAccount(
      db,
      student,
      { publishedContent: 'DELETE', confirmEmail: email },
      { removeStoredFiles: null },
      now,
    );
    expect(await db.pointEntry.count({ where: { userId: student } })).toBe(0);
    expect(await db.userBadge.count({ where: { userId: student } })).toBe(0);
    expect(await db.suspicionFlag.count({ where: { userId: student } })).toBe(0);
    const [mentorEntry] = await entriesOf(mentor);
    expect(mentorEntry).toMatchObject({ points: 10, counterpartId: null });
  });
});

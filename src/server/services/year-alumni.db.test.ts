import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { deleteAccount } from './accountDeletion';
import { buildDataExport } from './dataExport';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import {
  configureAwardCycle,
  freezeDueAwardCycles,
  listAwardCandidates,
  publicAward,
  recalculateAwardCycle,
  selectYearAlumnus,
  setAwardPublication,
} from './year-alumni';
const db = createTestPrisma();
afterAll(() => db.$disconnect());

describe('Yılın Mezunu', () => {
  it('akademik yıl, şüphe, dondurma, yönetici kapsamı ve yayın rızasını uygular', async () => {
    const inst = await createInstitution(db);
    const admin = await createUser(db),
      outsider = await createUser(db),
      alumnus = await createUser(db),
      suspicious = await createUser(db);
    for (const userId of [admin, outsider, alumnus, suspicious])
      await grantRequiredConsents(db, userId);
    await addMembership(db, { userId: admin, role: 'ACADEMIC', departmentId: inst.deptA1 });
    await addMembership(db, { userId: outsider, role: 'ACADEMIC', departmentId: inst.deptA2 });
    await addMembership(db, { userId: alumnus, role: 'ALUMNI', departmentId: inst.deptA1 });
    await addMembership(db, { userId: suspicious, role: 'ALUMNI', departmentId: inst.deptA1 });
    await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    await addGrant(db, { userId: outsider, scope: 'DEPARTMENT', departmentId: inst.deptA2 });
    const key = { departmentId: inst.deptA1, year: 2025 };
    const before = { db, now: () => new Date('2026-05-01T00:00:00Z') };
    await configureAwardCycle(before, admin, { ...key, ceremonyDate: '2026-06-30' });
    await expect(listAwardCandidates(before, outsider, key)).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
    });
    const point = (eventAt: string, sourceId: string) =>
      db.pointEntry.create({
        data: {
          userId: alumnus,
          action: 'SESSION_ONLINE',
          sourceType: 'APPOINTMENT',
          sourceId,
          basePoints: 10,
          points: 10,
          status: 'FINAL',
          eventAt: new Date(eventAt),
        },
      });
    await point('2025-08-31T20:59:59Z', 'outside');
    await point('2025-08-31T21:00:00Z', 'inside');
    await db.suspicionFlag.create({
      data: {
        userId: suspicious,
        rule: 'BURST',
        evidenceKey: 'test-' + suspicious,
        entryIds: [],
        windowStart: new Date(),
        windowEnd: new Date(),
        entryCount: 0,
        points: 0,
      },
    });
    const initial = await listAwardCandidates(before, admin, key);
    expect(initial.candidates.map((x) => [x.userId, x.points])).toEqual([[alumnus, 10]]);
    expect(initial.excludedForSuspicion).toBe(1);
    const missedKey = { departmentId: inst.deptA1, year: 2024 };
    await configureAwardCycle(before, admin, { ...missedKey, ceremonyDate: '2026-06-30' });
    const late = { db, now: () => new Date('2026-05-30T21:05:00Z') };
    await freezeDueAwardCycles(db, late.now());
    await expect(listAwardCandidates(late, admin, missedKey)).rejects.toMatchObject({
      code: 'AWARD_FREEZE_MISSED',
    });
    const recovered = await recalculateAwardCycle(late, admin, {
      ...missedKey,
      reason: 'İş gecikmesi',
    });
    expect(recovered.frozenAt).toEqual(late.now());
    const freezeAt = new Date('2026-05-30T21:00:00Z');
    await freezeDueAwardCycles(db, freezeAt);
    await point('2025-10-10T12:00:00Z', 'added-after-freeze');
    const frozen = { db, now: () => new Date('2026-06-01T00:00:00Z') };
    expect((await listAwardCandidates(frozen, admin, key)).candidates[0]?.points).toBe(10);
    expect(
      (await recalculateAwardCycle(frozen, admin, { ...key, reason: 'Yeniden değerlendirme' }))
        .candidates[0]?.points,
    ).toBe(20);
    const { awardId } = await selectYearAlumnus(frozen, admin, {
      ...key,
      userId: alumnus,
      reason: 'Örnek katkılar',
    });
    const row = await db.award.findUniqueOrThrow({
      where: { id: awardId },
      omit: { verificationCode: false },
    });
    expect(row.verificationCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await publicAward(db, row.verificationCode)).toBeNull();
    await setAwardPublication(frozen, alumnus, { awardId, public: true });
    const exported = await buildDataExport(db, alumnus);
    expect(exported.contribution.awards).toMatchObject([{ kind: 'YEAR_ALUMNI', year: 2025 }]);
    expect(exported.contribution.awardPublicationDecisions).toMatchObject([
      { version: 'taslak-1', granted: true },
    ]);
    expect(exported.contribution.awardCandidacies).toEqual(
      expect.arrayContaining([expect.objectContaining({ year: 2025, points: 20 })]),
    );
    expect(JSON.stringify(exported)).not.toContain(row.verificationCode);
    expect(Object.keys((await publicAward(db, row.verificationCode))!).sort()).toEqual([
      'award',
      'department',
      'name',
      'university',
      'year',
    ]);
    await db.award.update({ where: { id: awardId }, data: { publicConsentVersion: 'eski-1' } });
    expect(await publicAward(db, row.verificationCode)).toBeNull();
    await setAwardPublication(frozen, alumnus, { awardId, public: true });
    await setAwardPublication(frozen, alumnus, { awardId, public: false });
    expect(await publicAward(db, row.verificationCode)).toBeNull();
    await setAwardPublication(frozen, alumnus, { awardId, public: true });
    const user = await db.user.findUniqueOrThrow({
      where: { id: alumnus },
      select: { email: true },
    });
    await deleteAccount(
      db,
      alumnus,
      { publishedContent: 'DELETE', confirmEmail: user.email },
      { removeStoredFiles: null },
    );
    expect(await db.award.count({ where: { userId: alumnus } })).toBe(0);
    expect(await db.awardCandidate.count({ where: { userId: alumnus } })).toBe(0);
    expect(await publicAward(db, row.verificationCode)).toBeNull();
    const decisions = await db.awardPublicationDecision.findMany({ where: { userId: alumnus } });
    expect(decisions).toHaveLength(4);
    expect(decisions.every((decision) => decision.awardId === null)).toBe(true);
    await expect(
      db.awardPublicationDecision.update({
        where: { id: decisions[0]!.id },
        data: { granted: false },
      }),
    ).rejects.toThrow();
    await expect(
      db.awardPublicationDecision.delete({ where: { id: decisions[0]!.id } }),
    ).rejects.toThrow();
    expect(
      await db.adminAuditLog.count({
        where: { targetId: { in: [awardId] }, action: 'AWARD_SELECT' },
      }),
    ).toBe(1);
  });
});

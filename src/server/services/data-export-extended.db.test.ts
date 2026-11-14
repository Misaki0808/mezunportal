import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { dataExportSchema } from '@/contracts/privacy';
import { createTestPrisma } from '@/test/db';
import { createInstitution, createUser } from '@/test/fixtures';

const state = vi.hoisted(() => ({ db: null as unknown, userId: '' }));
vi.mock('@/server/db', () => ({ getDb: () => state.db }));
vi.mock('@/server/permissions', () => ({
  requireUserWithoutConsent: async () => ({ userId: state.userId }),
}));
import { GET } from '@/app/api/hesabim/veri-dokumu/route';

const db = createTestPrisma();
state.db = db;
afterAll(() => db.$disconnect());

it('yeni bölümler yalnız sahibin verisidir; bozuk aday 200 ve kişisel veri içermeyen tek günlük satırı üretir', async () => {
  const owner = await createUser(db);
  const other = await createUser(db);
  const { deptA1 } = await createInstitution(db);
  state.userId = owner;
  const secret = `KARSI-${randomUUID()}`;
  await db.user.update({ where: { id: other }, data: { name: secret } });
  for (const userId of [owner, other]) {
    const isOwner = userId === owner;
    await db.inAppNotification.create({
      data: {
        userId,
        kind: isOwner ? 'jobMatchPosting' : secret,
        refId: randomUUID(),
        key: randomUUID(),
      },
    });
    await db.notificationPreference.create({ data: { userId, type: 'FAQ', enabled: isOwner } });
    await db.mentorProfile.create({
      data: {
        userId,
        isActive: true,
        monthlyCapacity: 3,
        sessionMinutes: 30,
        meetingModes: ['ONLINE'],
        inPersonNote: isOwner ? 'Kendi notum' : secret,
      },
    });
    await db.availabilityRule.create({
      data: { mentorId: userId, weekday: 1, startMinute: 540, endMinute: 600 },
    });
    await db.graduationDocument.create({
      data: {
        userId,
        departmentId: deptA1,
        graduationYear: 2024,
        status: 'REJECTED',
        rejectReason: isOwner ? 'Kendi gerekçem' : secret,
        reviewedById: other,
        reviewedAt: new Date(),
      },
    });
  }
  const cycle = await db.awardCycle.create({
    data: { departmentId: deptA1, year: 2024, ceremonyAt: new Date('2025-01-01') },
  });
  await db.awardCandidate.create({
    data: {
      cycleId: cycle.id,
      userId: owner,
      points: 1,
      experienceCount: 0,
      meetingCount: 0,
      breakdown: { secret },
    },
  });
  const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    // Bozuk aday `UNREADABLE` işaretlidir (alan düzeyi mühür); işaretli alan çıkarılınca döküm sözleşmeye tam uyar.
    expect(
      dataExportSchema.safeParse({
        ...body,
        contribution: { ...body.contribution, awardCandidacies: [] },
      }).success,
    ).toBe(true);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0]).toMatchObject({ kind: 'jobMatchPosting', readAt: null });
    expect(body.notificationPreferences).toMatchObject([{ type: 'FAQ', enabled: true }]);
    expect(body.mentorSettings).toMatchObject({ monthlyCapacity: 3, inPersonNote: 'Kendi notum' });
    expect(body.availability).toMatchObject([{ weekday: 1, startMinute: 540 }]);
    expect(body.graduationDocuments).toMatchObject([
      { graduationYear: 2024, rejectReason: 'Kendi gerekçem' },
    ]);
    expect(body.contribution.awardCandidacies[0].breakdown).toBe('UNREADABLE');
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body.graduationDocuments)).not.toContain(other);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      event: 'route.unexpected',
      source: 'veriDokumu.alan',
      errorName: 'Error',
      okunamayan: ['contribution.awardCandidacies[0].breakdown'],
    });
    expect(line).not.toContain(secret);
  } finally {
    log.mockRestore();
  }
});

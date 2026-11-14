import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { DATA_EXPORT_FORMAT_VERSION, dataExportSchema } from '@/contracts/privacy';
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

async function exportOf(userId: string) {
  state.userId = userId;
  const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    const response = await GET();
    return {
      status: response.status,
      body: await response.json(),
      lines: log.mock.calls.map((call) => String(call[0])),
    };
  } finally {
    log.mockRestore();
  }
}

it('sürüm 2: sahibin yeni kayıtları dolu ve doğru değerlerle, başkasının satırı ve gizli alanlar yok', async () => {
  const owner = await createUser(db);
  const other = await createUser(db);
  const { deptA1 } = await createInstitution(db);
  const secret = `GIZLI-${randomUUID()}`;
  const readAt = new Date('2026-03-04T05:06:07.000Z');
  const pausedUntil = new Date('2026-12-01T10:00:00.000Z');
  const reviewedAt = new Date('2026-02-03T04:05:06.000Z');
  const sessionToken = `jeton-${randomUUID()}`;

  await db.inAppNotification.create({
    data: {
      userId: owner,
      kind: 'jobMatchPosting',
      refId: randomUUID(),
      key: randomUUID(),
      readAt,
    },
  });
  await db.mentorProfile.create({
    data: {
      userId: owner,
      isActive: true,
      monthlyCapacity: 3,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
      pausedUntil,
    },
  });
  await db.graduationDocument.create({
    data: {
      userId: owner,
      departmentId: deptA1,
      graduationYear: 2024,
      status: 'REJECTED',
      rejectReason: 'Kendi gerekçem',
      reviewedById: other,
      reviewedAt,
    },
  });
  // Şikâyet: kendi metnin dökümde, moderatör notu/kimliği yok; başkasının şikâyeti yok.
  const posting = await db.jobPosting.create({
    data: { authorId: other, departmentIdAtWrite: deptA1 },
  });
  await db.jobPostingReport.create({
    data: {
      postingId: posting.id,
      reporterId: owner,
      reason: 'Kendi ilan şikâyetim',
      status: 'RESOLVED',
      reviewedById: other,
      reviewedAt,
      resolutionNote: secret,
    },
  });
  await db.jobPostingReport.create({
    data: { postingId: posting.id, reporterId: other, reason: secret },
  });
  const experience = await db.experience.create({
    data: {
      authorId: other,
      departmentIdAtWrite: deptA1,
      type: 'CLUB',
      whatLearned: 'Öğrendiklerim',
      advice: 'Tavsiyem',
      isAnonymous: false,
      status: 'DRAFT',
      processSteps: [],
      interviewQuestions: [],
    },
  });
  await db.report.create({
    data: {
      targetType: 'EXPERIENCE',
      targetId: experience.id,
      reporterId: owner,
      reason: 'Kendi deneyim şikâyetim',
    },
  });
  await db.report.create({
    data: { targetType: 'EXPERIENCE', targetId: experience.id, reporterId: other, reason: secret },
  });
  // Dış hesap: başkası bağladıysa owner'ın dökümünde yok; owner bağlayınca etiket var, jeton yok.
  await db.integrationConnection.create({
    data: {
      provider: 'GOOGLE_CALENDAR',
      refreshTokenEnc: `v1.${secret}.a.b`,
      accountLabel: 'Takvim etiketi',
      scope: 'calendar.events',
      connectedById: other,
    },
  });
  expect((await exportOf(owner)).body.integrations).toEqual([]);
  await db.integrationConnection.updateMany({ data: { connectedById: owner } });
  // Oturum: IP/UA dökümde; jeton, kimlik ve yönetici kimliği yok.
  await db.session.create({
    data: {
      token: sessionToken,
      userId: owner,
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      ipAddress: '203.0.113.9',
      userAgent: 'Ornek Tarayici/1.0',
      impersonatedBy: other,
    },
  });
  await db.session.create({
    data: {
      token: `jeton-${randomUUID()}`,
      userId: other,
      expiresAt: new Date('2027-01-01'),
      ipAddress: secret,
    },
  });
  const idempotencyKey = `anahtar-${randomUUID()}`;
  await db.emailLog.create({
    data: {
      idempotencyKey,
      template: 'magic-link',
      recipientUserId: owner,
      status: 'SENT',
      sentAt: reviewedAt,
    },
  });
  await db.emailLog.create({
    data: {
      idempotencyKey: `x-${randomUUID()}`,
      template: 'baska-sablon',
      recipientUserId: other,
      status: 'SENT',
      sentAt: reviewedAt,
    },
  });
  await db.adminGrant.create({
    data: { userId: owner, scope: 'DEPARTMENT', departmentId: deptA1, grantedById: other },
  });
  // Başkasının yönetici yetkisi ve bildirim eylemi (sahibin dökümünde olmamalı).
  await db.adminGrant.create({
    data: { userId: other, scope: 'SYSTEM', grantedById: owner },
  });
  const otherPosition = await db.position.create({
    data: { userId: other, companyRaw: 'Baska Kurum', titleRaw: 'Baska Unvan', source: 'MANUAL' },
  });
  await db.notificationAction.create({
    data: {
      userId: other,
      positionId: otherPosition.id,
      cycle: '2026-04',
      expiresAt: new Date('2026-05-01T00:00:00.000Z'),
    },
  });
  await db.event.create({
    data: {
      type: 'PROFILE_THRESHOLD',
      userId: owner,
      role: 'STUDENT',
      departmentId: deptA1,
      props: { threshold: 40 },
    },
  });
  await db.event.create({ data: { type: 'LOGIN', userId: other, props: { secret } } });
  await db.jobMatchDigest.create({ data: { userId: owner, day: '2026-03-04' } });
  await db.jobMatchDigest.create({ data: { userId: other, day: '2026-03-05' } });
  const position = await db.position.create({
    data: { userId: owner, companyRaw: 'Kurum', titleRaw: 'Stajyer', source: 'MANUAL' },
  });
  await db.notificationAction.create({
    data: {
      userId: owner,
      positionId: position.id,
      cycle: '2026-03',
      expiresAt: new Date('2026-04-01T00:00:00.000Z'),
      choice: 'YES',
      usedAt: readAt,
    },
  });
  await db.user.update({
    where: { id: owner },
    data: { image: 'https://img.example.org/ben.png' },
  });

  const { status, body, lines } = await exportOf(owner);
  expect(status).toBe(200);
  expect(lines).toEqual([]);
  expect(body.formatVersion).toBe(DATA_EXPORT_FORMAT_VERSION);
  expect(DATA_EXPORT_FORMAT_VERSION).toBe(2);
  expect(dataExportSchema.safeParse(body).success).toBe(true);
  // Değerler dönüşümle bozulmuyor (370 P3-2: readAt / pausedUntil / reviewedAt).
  expect(body.notifications[0].readAt).toBe(readAt.toISOString());
  expect(body.mentorSettings.pausedUntil).toBe(pausedUntil.toISOString());
  expect(body.graduationDocuments[0].reviewedAt).toBe(reviewedAt.toISOString());
  expect(body.notificationActions).toMatchObject([
    { cycle: '2026-03', choice: 'YES', usedAt: readAt.toISOString(), positionId: position.id },
  ]);
  expect(body.user.image).toBe('https://img.example.org/ben.png');
  expect(body.reports.map((r: { reason: string }) => r.reason).sort()).toEqual([
    'Kendi deneyim şikâyetim',
    'Kendi ilan şikâyetim',
  ]);
  expect(
    body.reports.find((r: { targetType: string }) => r.targetType === 'JOB_POSTING'),
  ).toMatchObject({
    targetId: posting.id,
    status: 'RESOLVED',
  });
  expect(body.integrations).toMatchObject([
    { provider: 'GOOGLE_CALENDAR', accountLabel: 'Takvim etiketi', status: 'ACTIVE' },
  ]);
  expect(body.sessions).toMatchObject([
    { ipAddress: '203.0.113.9', userAgent: 'Ornek Tarayici/1.0', impersonated: true },
  ]);
  expect(body.emailLog).toMatchObject([
    { template: 'magic-link', status: 'SENT', sentAt: reviewedAt.toISOString() },
  ]);
  expect(body.adminGrants).toHaveLength(1);
  expect(body.notificationActions).toHaveLength(1);
  expect(body.adminGrants).toMatchObject([
    { scope: 'DEPARTMENT', departmentId: deptA1, revokedAt: null },
  ]);
  expect(body.events).toMatchObject([
    { type: 'PROFILE_THRESHOLD', role: 'STUDENT', props: { threshold: 40 } },
  ]);
  expect(body.jobMatchDigests).toMatchObject([{ day: '2026-03-04' }]);
  // Başkasının verisi ve gizli değerler yok.
  const text = JSON.stringify(body);
  for (const forbidden of [
    secret,
    sessionToken,
    idempotencyKey,
    other,
    'v1.',
    'resolutionNote',
    'refreshTokenEnc',
  ]) {
    expect(text, forbidden).not.toContain(forbidden);
  }
  for (const key of [
    'token',
    'idempotencyKey',
    'grantedById',
    'reviewedById',
    'impersonatedBy',
    'storageKey',
  ]) {
    expect(text, key).not.toContain(`"${key}"`);
  }
});

it('alan düzeyinde mühür: şemaya uymayan değer dökümü düşürmez, işaretlenir, çağrı başına tek değersiz günlük', async () => {
  const owner = await createUser(db);
  const { deptA1 } = await createInstitution(db);
  await db.profile.create({
    data: { userId: owner, headline: 'Başlığım', completionScore: 150 },
  });
  const cycle = await db.awardCycle.create({
    data: { departmentId: deptA1, year: 2031, ceremonyAt: new Date('2032-01-01') },
  });
  await db.awardCandidate.create({
    data: {
      cycleId: cycle.id,
      userId: owner,
      points: 7,
      experienceCount: 1,
      meetingCount: 2,
      breakdown: 'GIZLI-bozuk-deger',
    },
  });
  const { status, body, lines } = await exportOf(owner);
  expect(status).toBe(200);
  expect(body.profile.completionScore).toBe('UNREADABLE');
  expect(body.profile.headline).toBe('Başlığım');
  expect(body.contribution.awardCandidacies[0]).toMatchObject({
    points: 7,
    breakdown: 'UNREADABLE',
  });
  expect(body.user.id).toBe(owner);
  // iki bozuk alan, TEK satır; yalnız sözleşme yolları
  expect(lines).toHaveLength(1);
  const line = JSON.parse(lines[0]!);
  expect(line).toMatchObject({
    event: 'route.unexpected',
    source: 'veriDokumu.alan',
    errorName: 'Error',
  });
  expect(new Set(line.okunamayan)).toEqual(
    new Set(['profile.completionScore', 'contribution.awardCandidacies[0].breakdown']),
  );
  expect(lines[0]).not.toMatch(/GIZLI|150|Başlığım/);
});

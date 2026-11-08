import { randomBytes, randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { dataExportSchema } from '@/contracts/privacy';
import { experienceDetailSchema, type ExperienceDraftTemplate } from '@/contracts/experience';
import { createTestPrisma } from '@/test/db';
import { addGrant, addMembership, createInstitution, createUser } from '@/test/fixtures';

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('../db', () => ({ getDb: () => db }));
vi.mock('../permissions/session', () => ({ getSessionUserId: async () => session.userId }));
import * as actions from '../actions/experience';
import * as service from './experience';
import { deleteAccount } from './accountDeletion';
import { buildDataExport } from './dataExport';
import { getOnboardingState, saveOnboardingStep } from './profile';

const db = createTestPrisma();
const NOW = new Date('2026-11-08T01:00:00Z');
let institution: Awaited<ReturnType<typeof createInstitution>>,
  otherInstitution: typeof institution;
let moderator: string;
beforeAll(async () => {
  institution = await createInstitution(db);
  otherInstitution = await createInstitution(db);
  moderator = await member(institution.deptA1);
  await addGrant(db, { userId: moderator, scope: 'DEPARTMENT', departmentId: institution.deptA1 });
});
afterAll(() => db.$disconnect());
async function member(departmentId: string, status: 'PENDING' | 'VERIFIED' = 'VERIFIED') {
  const id = await createUser(db);
  await addMembership(db, { userId: id, departmentId, role: 'STUDENT', entryYear: 2024, status });
  return id;
}
function content(): ExperienceDraftTemplate {
  return {
    type: 'INTERNSHIP',
    organizationName: 'Örnek Şirket',
    termYear: 2026,
    termSeason: 'SUMMER',
    durationWeeks: 8,
    pay: 'PAID',
    applicationChannel: 'COMPANY_SITE',
    processSteps: [{ title: 'Başvuru', description: 'Çevrim içi form' }],
    interviewQuestions: ['Takımda nasıl çalışırsın?'],
    whatLearned: 'Takım çalışması',
    advice: 'Erken başvur',
  };
}
async function draft(
  userId: string,
  isAnonymous = true,
  departmentId = institution.deptA1,
  body = content(),
) {
  return service.saveExperienceDraft(db, userId, { departmentId, content: body, isAnonymous }, NOW);
}
async function published(userId: string, isAnonymous = true) {
  const row = await draft(userId, isAnonymous);
  await service.submitExperience(db, userId, { experienceId: row.id }, NOW);
  await service.reviewExperience(db, moderator, { experienceId: row.id, decision: 'PUBLISH' }, NOW);
  return row.id;
}
async function ok<T>(result: Promise<{ ok: true; data: T } | { ok: false; errorCode: string }>) {
  const response = await result;
  expect(response.ok).toBe(true);
  if (!response.ok) throw new Error(response.errorCode);
  return response.data;
}
const inputs = {
  saveExperienceDraft: () => ({
    departmentId: institution.deptA1,
    content: content(),
    isAnonymous: true,
  }),
  submitExperience: () => ({ experienceId: 'missing' }),
  reviewExperience: () => ({ experienceId: 'missing', decision: 'PUBLISH' as const }),
  reportExperience: () => ({ experienceId: 'missing', reason: 'Yanıltıcı bilgi' }),
  listMyExperiences: () => ({}),
  getExperienceDetail: () => ({ experienceId: 'missing' }),
  listModerationQueue: () => ({}),
  listExperienceReports: () => ({}),
  resolveExperienceReport: () => ({
    reportId: 'missing',
    decision: 'DISMISSED' as const,
    reason: 'İhlal bulunamadı',
  }),
};
function allActions() {
  return [
    () => actions.saveExperienceDraft(inputs.saveExperienceDraft()),
    () => actions.submitExperience(inputs.submitExperience()),
    () => actions.reviewExperience(inputs.reviewExperience()),
    () => actions.reportExperience(inputs.reportExperience()),
    () => actions.listMyExperiences({}),
    () => actions.getExperienceDetail(inputs.getExperienceDetail()),
    () => actions.listModerationQueue({}),
    () => actions.listExperienceReports({}),
    () => actions.resolveExperienceReport(inputs.resolveExperienceReport()),
  ];
}

describe('gerçek oturum koruması ve deneyim servisleri', () => {
  it.each(['unverified', 'suspended', 'deleted', 'anonymous'] as const)(
    'dokuz eylem %s kullanıcıya kapalıdır',
    async (kind) => {
      const userId = await member(
        institution.deptA1,
        kind === 'unverified' ? 'PENDING' : 'VERIFIED',
      );
      if (kind === 'unverified')
        await db.membership.updateMany({
          where: { userId },
          data: { role: 'ALUMNI', verificationMethod: 'GRADUATION_DOCUMENT' },
        });
      if (kind === 'suspended')
        await db.user.update({ where: { id: userId }, data: { banned: true } });
      if (kind === 'deleted')
        await db.user.update({ where: { id: userId }, data: { deletedAt: NOW } });
      session.userId = kind === 'anonymous' ? null : userId;
      const errorCode =
        kind === 'suspended'
          ? 'AUTH_ACCOUNT_SUSPENDED'
          : kind === 'unverified'
            ? 'AUTH_NOT_VERIFIED'
            : 'AUTH_UNAUTHENTICATED';
      for (const call of allActions()) expect(await call()).toEqual({ ok: false, errorCode });
      expect(await db.experience.count({ where: { authorId: userId } })).toBe(0);
    },
  );
  it('taslak yenilenir, tür değişince eski alanlar temizlenir; eksik içerik gönderilemez', async () => {
    const author = await member(institution.deptA1);
    const row = await draft(author);
    const changed = await service.saveExperienceDraft(
      db,
      author,
      {
        experienceId: row.id,
        departmentId: institution.deptA1,
        content: { type: 'CERTIFICATE' },
        isAnonymous: false,
      },
      NOW,
    );
    expect(changed.content).toEqual({ type: 'CERTIFICATE' });
    const stored = await db.experience.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.pay).toBeNull();
    expect(stored.interviewQuestions).toEqual([]);
    await expect(
      service.submitExperience(db, author, { experienceId: row.id }, NOW),
    ).rejects.toMatchObject({ code: 'EXPERIENCE_INCOMPLETE' });
    expect(stored.status).toBe('DRAFT');
  });
  it('başkasının taslağı ve istemcinin bölüm/yazar/yayın sahteciliği yazılamaz', async () => {
    const author = await member(institution.deptA1),
      other = await member(institution.deptA1);
    const row = await draft(author);
    await expect(
      service.saveExperienceDraft(
        db,
        other,
        {
          experienceId: row.id,
          departmentId: institution.deptA1,
          content: content(),
          isAnonymous: true,
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(draft(author, true, institution.deptA2)).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
    });
    await expect(
      service.saveExperienceDraft(
        db,
        author,
        {
          experienceId: row.id,
          departmentId: institution.deptA2,
          content: content(),
          isAnonymous: true,
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    session.userId = author;
    expect(
      await actions.saveExperienceDraft({
        ...inputs.saveExperienceDraft(),
        authorId: other,
        status: 'PUBLISHED',
      } as never),
    ).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    expect(
      await actions.saveExperienceDraft({
        ...inputs.saveExperienceDraft(),
        prefillPositionId: 'unbound-position',
      }),
    ).toEqual({ ok: false, errorCode: 'VALIDATION_INVALID' });
    expect((await db.experience.findUniqueOrThrow({ where: { id: row.id } })).authorId).toBe(
      author,
    );
  });
  it('K-07 aynı üniversitenin başka fakültesine açık; başka üniversiteye kapalı, taslak yalnız sahip/moderatöre', async () => {
    const author = await member(institution.deptA1),
      same = await member(institution.deptB1),
      outsider = await member(otherInstitution.deptA1);
    const row = await draft(author);
    await expect(
      service.getExperienceDetail(db, same, { experienceId: row.id }, NOW),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(
      (await service.getExperienceDetail(db, moderator, { experienceId: row.id }, NOW)).id,
    ).toBe(row.id);
    await service.submitExperience(db, author, { experienceId: row.id }, NOW);
    await service.reviewExperience(
      db,
      moderator,
      { experienceId: row.id, decision: 'PUBLISH' },
      NOW,
    );
    expect((await service.getExperienceDetail(db, same, { experienceId: row.id }, NOW)).id).toBe(
      row.id,
    );
    await expect(
      service.getExperienceDetail(db, outsider, { experienceId: row.id }, NOW),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(
      service.reportExperience(db, outsider, { experienceId: row.id, reason: 'Gerekçe' }, NOW),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
  it('yayın yalnız kendi kapsamını kapsayan moderatörle; kuyruğa filtre eklemek yetki vermez', async () => {
    const author = await member(institution.deptA1),
      wrong = await member(institution.deptA2);
    await addGrant(db, { userId: wrong, scope: 'DEPARTMENT', departmentId: institution.deptA2 });
    const row = await draft(author);
    await service.submitExperience(db, author, { experienceId: row.id }, NOW);
    await expect(
      service.reviewExperience(db, author, { experienceId: row.id, decision: 'PUBLISH' }, NOW),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    await expect(
      service.reviewExperience(db, wrong, { experienceId: row.id, decision: 'PUBLISH' }, NOW),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    expect((await service.listModerationQueue(db, wrong, {}, NOW)).items).toEqual([]);
    await expect(
      service.listModerationQueue(db, wrong, { departmentId: institution.deptA1 }, NOW),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    expect(
      (await service.listModerationQueue(db, moderator, {}, NOW)).items.some(
        (item) => item.id === row.id,
      ),
    ).toBe(true);
    await expect(service.listModerationQueue(db, author, {}, NOW)).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
    });
  });
  it('fakülte ve sistem kapsamı kanonik yetki korumasını izler; yazım anındaki bölüm sabittir', async () => {
    const author = await member(institution.deptA1),
      faculty = await member(institution.deptA2),
      system = await member(otherInstitution.deptA1);
    await addGrant(db, { userId: faculty, scope: 'FACULTY', facultyId: institution.facultyA });
    await addGrant(db, { userId: system, scope: 'SYSTEM' });
    const row = await draft(author);
    await service.submitExperience(db, author, { experienceId: row.id }, NOW);
    await db.membership.updateMany({ where: { userId: author }, data: { endedAt: NOW } });
    await addMembership(db, {
      userId: author,
      departmentId: institution.deptB1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    expect(
      (await service.listModerationQueue(db, faculty, {}, NOW)).items.some(
        (item) => item.id === row.id,
      ),
    ).toBe(true);
    expect(
      (await service.listModerationQueue(db, system, {}, NOW)).items.some(
        (item) => item.id === row.id,
      ),
    ).toBe(true);
    await service.reviewExperience(db, faculty, { experienceId: row.id, decision: 'PUBLISH' }, NOW);
  });
  it('ret → düzenle → gönder → yayın; audit başarısızsa karar geri alınır', async () => {
    const author = await member(institution.deptA1),
      row = await draft(author);
    await service.submitExperience(db, author, { experienceId: row.id }, NOW);
    await expect(
      service.reviewExperience(
        db,
        moderator,
        { experienceId: row.id, decision: 'REJECT', reason: 'a@example.local' },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'AUDIT_REASON_INVALID' });
    expect((await db.experience.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'PENDING',
    );
    expect(await db.adminAuditLog.count({ where: { targetId: row.id } })).toBe(0);
    await service.reviewExperience(
      db,
      moderator,
      { experienceId: row.id, decision: 'REJECT', reason: 'Açıklama eksik' },
      NOW,
    );
    const revised = await service.saveExperienceDraft(
      db,
      author,
      {
        experienceId: row.id,
        departmentId: institution.deptA1,
        content: content(),
        isAnonymous: true,
      },
      NOW,
    );
    expect(revised.moderationNote).toBeNull();
    expect(revised.status).toBe('DRAFT');
    await service.submitExperience(db, author, { experienceId: row.id }, NOW);
    await service.reviewExperience(
      db,
      moderator,
      { experienceId: row.id, decision: 'PUBLISH' },
      NOW,
    );
    await expect(
      service.saveExperienceDraft(
        db,
        author,
        {
          experienceId: row.id,
          departmentId: institution.deptA1,
          content: content(),
          isAnonymous: true,
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'EXPERIENCE_NOT_EDITABLE' });
    expect(await db.adminAuditLog.count({ where: { targetId: row.id } })).toBe(2);
  });
  it('eşzamanlı iki moderasyon kararı: tek durum değişimi ve tek audit kaydı', async () => {
    const author = await member(institution.deptA1),
      second = await member(institution.deptA1);
    await addGrant(db, { userId: second, scope: 'DEPARTMENT', departmentId: institution.deptA1 });
    const row = await draft(author);
    await service.submitExperience(db, author, { experienceId: row.id }, NOW);
    const results = await Promise.allSettled([
      service.reviewExperience(db, moderator, { experienceId: row.id, decision: 'PUBLISH' }, NOW),
      service.reviewExperience(
        db,
        second,
        { experienceId: row.id, decision: 'REJECT', reason: 'Yetersiz açıklama' },
        NOW,
      ),
    ]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((item) => item.status === 'rejected');
    expect(failed?.status === 'rejected' ? failed.reason : null).toMatchObject({
      code: 'EXPERIENCE_NOT_PENDING',
    });
    expect(await db.adminAuditLog.count({ where: { targetId: row.id } })).toBe(1);
  });
  it('sayfalama yalnız kendi/kapsamındaki kayıtları döndürür, yabancı cursor veri sızdırmaz', async () => {
    const author = await member(institution.deptA1),
      other = await member(institution.deptA1);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await draft(author)).id);
    const foreign = await draft(other);
    const first = await service.listMyExperiences(db, author, { limit: 2 }, NOW);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const next = await service.listMyExperiences(
      db,
      author,
      { limit: 2, cursor: first.nextCursor ?? undefined },
      NOW,
    );
    expect([...first.items, ...next.items].map((item) => item.id).sort()).toEqual(ids.sort());
    expect(
      (await service.listMyExperiences(db, author, { cursor: foreign.id }, NOW)).items.every(
        (item) => ids.includes(item.id),
      ),
    ).toBe(true);
  });
});

describe('anonimlik: rastgele verili tüm eylem yanıtları', () => {
  it.each([1, 2, 3])(
    'rastgele kişi %i: bütün dokuz eylemde yazar kimliği/iletişimi yok',
    async () => {
      const author = await member(institution.deptA1),
        reader = await member(institution.deptB1);
      const secret = {
        id: author,
        name: `Anon-${randomBytes(12).toString('hex')}`,
        email: `${randomBytes(12).toString('hex')}@test.local`,
        phone: `+905${randomInt(100000000, 999999999)}`,
      };
      await db.user.update({
        where: { id: author },
        data: { name: secret.name, email: secret.email, phone: secret.phone },
      });
      const outputs: unknown[] = [];
      session.userId = author;
      const row = await ok(actions.saveExperienceDraft(inputs.saveExperienceDraft()));
      outputs.push(row);
      outputs.push(await ok(actions.listMyExperiences({})));
      outputs.push(await ok(actions.submitExperience({ experienceId: row.id })));
      session.userId = moderator;
      outputs.push(await ok(actions.listModerationQueue({})));
      outputs.push(await ok(actions.getExperienceDetail({ experienceId: row.id })));
      outputs.push(
        await ok(actions.reviewExperience({ experienceId: row.id, decision: 'PUBLISH' })),
      );
      session.userId = reader;
      outputs.push(await ok(actions.getExperienceDetail({ experienceId: row.id })));
      const report = await ok(
        actions.reportExperience({ experienceId: row.id, reason: 'Yanıltıcı bilgi' }),
      );
      outputs.push(report);
      session.userId = moderator;
      const reports = await ok(actions.listExperienceReports({}));
      outputs.push(reports);
      expect(JSON.stringify(reports)).not.toContain(reader);
      outputs.push(
        await ok(
          actions.resolveExperienceReport({
            reportId: report.reportId,
            decision: 'DISMISSED',
            reason: 'İhlal bulunamadı',
          }),
        ),
      );
      for (const output of outputs)
        for (const value of Object.values(secret))
          expect(JSON.stringify(output)).not.toContain(value);
      expect(experienceDetailSchema.safeParse(row).success).toBe(true);
      const logs = await db.adminAuditLog.findMany({
        where: { OR: [{ targetId: row.id }, { targetId: report.reportId }] },
        select: { metadata: true, reason: true },
      });
      expect(JSON.stringify(logs)).not.toContain(author);
    },
  );
  it('adlı içerik yalnız açık id/görünen ad taşır, e-posta/telefon veya ilişkiler taşımaz', async () => {
    const author = await member(institution.deptA1),
      row = await draft(author, false);
    expect(row.isAnonymous).toBe(false);
    expect('author' in row ? Object.keys(row.author).sort() : []).toEqual(['displayName', 'id']);
    expect(JSON.stringify(row)).not.toContain('@');
  });
});

it('şikâyet hız sınırı, tek açık kayıt, kapsamlı kuyruk ve atomik çözüm', async () => {
  const author = await member(institution.deptA1),
    reporter = await member(institution.deptB1),
    wrong = await member(institution.deptA2);
  await addGrant(db, { userId: wrong, scope: 'DEPARTMENT', departmentId: institution.deptA2 });
  const ids: string[] = [];
  for (let i = 0; i < 11; i++) ids.push(await published(author));
  const reports = [];
  for (const id of ids.slice(0, 10))
    reports.push(
      await service.reportExperience(
        db,
        reporter,
        { experienceId: id, reason: 'Yanıltıcı bilgi' },
        NOW,
      ),
    );
  await expect(
    service.reportExperience(db, reporter, { experienceId: ids[0]!, reason: 'Yeniden' }, NOW),
  ).rejects.toMatchObject({ code: 'REPORT_ALREADY_OPEN' });
  await expect(
    service.reportExperience(
      db,
      reporter,
      { experienceId: ids[10]!, reason: 'Yanıltıcı bilgi' },
      NOW,
    ),
  ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  expect((await service.listExperienceReports(db, wrong, {}, NOW)).items).toEqual([]);
  await expect(
    service.resolveExperienceReport(
      db,
      wrong,
      { reportId: reports[0]!.reportId, decision: 'DISMISSED', reason: 'İhlal yok' },
      NOW,
    ),
  ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  await expect(
    service.resolveExperienceReport(
      db,
      moderator,
      { reportId: reports[0]!.reportId, decision: 'DISMISSED', reason: 'a@example.local' },
      NOW,
    ),
  ).rejects.toMatchObject({ code: 'AUDIT_REASON_INVALID' });
  expect((await db.report.findUniqueOrThrow({ where: { id: reports[0]!.reportId } })).status).toBe(
    'OPEN',
  );
  await service.resolveExperienceReport(
    db,
    moderator,
    { reportId: reports[0]!.reportId, decision: 'DISMISSED', reason: 'İhlal bulunamadı' },
    NOW,
  );
  await expect(
    service.resolveExperienceReport(
      db,
      moderator,
      { reportId: reports[0]!.reportId, decision: 'RESOLVED', reason: 'Tekrar' },
      NOW,
    ),
  ).rejects.toMatchObject({ code: 'REPORT_NOT_OPEN' });
  await service.reportExperience(
    db,
    reporter,
    { experienceId: ids[10]!, reason: 'Yanıltıcı bilgi' },
    new Date(NOW.getTime() + 86400001),
  );
});

it.each(['DELETE', 'ANONYMIZE'] as const)(
  'K-09 %s ve kendi veri dökümü: deneyimler + raporlar yaşam döngüsüne bağlı',
  async (publishedContent) => {
    const author = await member(institution.deptA1),
      other = await member(institution.deptA1);
    const id = await published(author, false),
      privateDraft = await draft(author),
      otherId = await published(other);
    const pending = await draft(author),
      rejected = await draft(author);
    await service.submitExperience(db, author, { experienceId: pending.id }, NOW);
    await service.submitExperience(db, author, { experienceId: rejected.id }, NOW);
    await service.reviewExperience(
      db,
      moderator,
      { experienceId: rejected.id, decision: 'REJECT', reason: 'Açıklama eksik' },
      NOW,
    );
    await service.reportExperience(
      db,
      author,
      { experienceId: otherId, reason: 'Kişisel şikâyet' },
      NOW,
    );
    const exported = await buildDataExport(db, author, NOW);
    expect(dataExportSchema.safeParse(exported).success).toBe(true);
    expect(exported.experiences.map((item) => item.id).sort()).toEqual(
      [id, privateDraft.id, pending.id, rejected.id].sort(),
    );
    expect(JSON.stringify(exported.experiences)).not.toContain(author);
    expect(JSON.stringify(exported.experiences)).not.toContain(other);
    const user = await db.user.findUniqueOrThrow({ where: { id: author } });
    await deleteAccount(
      db,
      author,
      { publishedContent, confirmEmail: user.email },
      { removeStoredFiles: null },
      NOW,
    );
    expect(await db.experience.count({ where: { authorId: author } })).toBe(0);
    expect(await db.experience.count({ where: { id: privateDraft.id } })).toBe(0);
    expect(await db.report.count({ where: { reporterId: author } })).toBe(0);
    expect(await db.experience.count({ where: { id: otherId } })).toBe(1);
    if (publishedContent === 'DELETE') expect(await db.experience.count({ where: { id } })).toBe(0);
    else {
      expect(await db.experience.findUniqueOrThrow({ where: { id } })).toMatchObject({
        authorId: null,
        isAnonymous: true,
        status: 'PUBLISHED',
      });
      const detail = await service.getExperienceDetail(db, other, { experienceId: id }, NOW);
      expect(detail.isAnonymous).toBe(true);
      expect('author' in detail).toBe(false);
    }
  },
);
it('hesap silmede sonraki işleyici düşerse deneyimler ve hesap birlikte geri alınır', async () => {
  const author = await member(institution.deptA1),
    id = await published(author);
  const user = await db.user.findUniqueOrThrow({ where: { id: author } });
  await expect(
    deleteAccount(
      db,
      author,
      { publishedContent: 'DELETE', confirmEmail: user.email },
      {
        removeStoredFiles: null,
        handlers: [
          async () => {
            throw new Error('sahte hata');
          },
        ],
      },
      NOW,
    ),
  ).rejects.toThrow();
  expect(await db.experience.count({ where: { id, authorId: author } })).toBe(1);
  expect((await db.user.findUniqueOrThrow({ where: { id: author } })).deletedAt).toBeNull();
});
it('hesap silmeyle eşzamanlı kayıt silinmiş hesaba yeni deneyim bırakmaz', async () => {
  const author = await member(institution.deptA1),
    user = await db.user.findUniqueOrThrow({ where: { id: author } });
  const result = await Promise.allSettled([
    deleteAccount(
      db,
      author,
      { publishedContent: 'ANONYMIZE', confirmEmail: user.email },
      { removeStoredFiles: null },
      NOW,
    ),
    draft(author),
  ]);
  expect(result[0].status).toBe('fulfilled');
  if (result[1].status === 'rejected')
    expect(result[1].reason).toMatchObject({ code: 'AUTH_UNAUTHENTICATED' });
  expect(await db.experience.count({ where: { authorId: author } })).toBe(0);
});
it('K-08 yalnız gerçekten yayınlanmış kendi deneyimini sayar; alt sınıfı deneyim tek başına açmaz', async () => {
  const upper = await member(institution.deptA1),
    lower = await member(institution.deptA1);
  await db.membership.updateMany({ where: { userId: lower }, data: { entryYear: 2025 } });
  expect((await getOnboardingState(db, upper, NOW)).studentMentorEligibility).toEqual({
    eligible: false,
    reason: 'PUBLISHED_EXPERIENCE_REQUIRED',
  });
  await draft(upper);
  expect((await getOnboardingState(db, upper, NOW)).studentMentorEligibility?.eligible).toBe(false);
  await published(lower);
  expect((await getOnboardingState(db, upper, NOW)).studentMentorEligibility?.eligible).toBe(false);
  expect((await getOnboardingState(db, lower, NOW)).studentMentorEligibility).toEqual({
    eligible: false,
    reason: 'NOT_UPPER_CLASS',
  });
  await published(upper);
  expect((await getOnboardingState(db, upper, NOW)).studentMentorEligibility).toEqual({
    eligible: true,
    reason: null,
  });
  expect(
    (await saveOnboardingStep(db, upper, { step: 'MENTOR_PREFERENCE', interested: true }, NOW))
      .mentorInterested,
  ).toBe(true);
  expect(await db.mentorProfile.count({ where: { userId: upper } })).toBe(0);
});

it('moderasyonla hesap silme yarışında yayın anonim kalır veya içerik silinir; yazar bağı kalmaz', async () => {
  const author = await member(institution.deptA1),
    row = await draft(author);
  await service.submitExperience(db, author, { experienceId: row.id }, NOW);
  const user = await db.user.findUniqueOrThrow({ where: { id: author } });
  const result = await Promise.allSettled([
    service.reviewExperience(db, moderator, { experienceId: row.id, decision: 'PUBLISH' }, NOW),
    deleteAccount(
      db,
      author,
      { publishedContent: 'ANONYMIZE', confirmEmail: user.email },
      { removeStoredFiles: null },
      NOW,
    ),
  ]);
  expect(result[1].status).toBe('fulfilled');
  if (result[0].status === 'rejected')
    expect(result[0].reason).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  const stored = await db.experience.findUnique({ where: { id: row.id } });
  if (stored)
    expect(stored).toMatchObject({ authorId: null, isAnonymous: true, status: 'PUBLISHED' });
  expect(await db.experience.count({ where: { authorId: author } })).toBe(0);
});

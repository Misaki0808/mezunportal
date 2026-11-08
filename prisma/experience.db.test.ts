import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { createTestPrisma } from '@/test/db';
import { createInstitution, createUser } from '@/test/fixtures';

const db = createTestPrisma();
let authorId: string, moderatorId: string, departmentIdAtWrite: string;
beforeAll(async () => {
  authorId = await createUser(db);
  moderatorId = await createUser(db);
  departmentIdAtWrite = (await createInstitution(db)).deptA1;
});
afterAll(() => db.$disconnect());
const pending = () => ({
  authorId,
  departmentIdAtWrite,
  type: 'INTERNSHIP' as const,
  organizationName: 'Örnek Şirket',
  termYear: 2026,
  termSeason: 'SUMMER' as const,
  durationWeeks: 8,
  pay: 'UNPAID' as const,
  applicationChannel: 'COMPANY_SITE' as const,
  processSteps: [{ title: 'Başvuru', description: 'Çevrim içi form' }],
  interviewQuestions: ['Neden bu alan?'],
  whatLearned: 'Takım çalışması',
  advice: 'Erken başvur',
  status: 'PENDING' as const,
});
async function draft() {
  return db.experience.create({ data: { authorId, departmentIdAtWrite, type: 'INTERNSHIP' } });
}

describe('P1-07 gerçek DB değişmezleri', () => {
  it('boş taslak DRAFT varsayılanıyla saklanır; içerik Membership değil User bağı taşır', async () => {
    const row = await draft();
    expect(row.status).toBe('DRAFT');
    expect(row.authorId).toBe(authorId);
    expect(row.interviewQuestions).toEqual([]);
    expect(row.processSteps).toEqual([]);
    expect(row.publishedAt).toBeNull();
  });
  it('tam olmayan taslak gönderilemez; PENDING tamamlanmış içerik ister', async () => {
    const row = await draft();
    await expect(
      db.experience.update({ where: { id: row.id }, data: { status: 'PENDING' } }),
    ).rejects.toThrow();
    expect((await db.experience.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('DRAFT');
    expect((await db.experience.create({ data: pending() })).status).toBe('PENDING');
  });
  it('doğrudan SQL ile moderatör/karar anı olmadan yayın veya gerekçesiz ret yazılamaz', async () => {
    const row = await db.experience.create({ data: pending() });
    await expect(
      db.$executeRaw`UPDATE "Experience" SET "status"='PUBLISHED', "publishedAt"=now() WHERE "id"=${row.id}`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE "Experience" SET "status"='REJECTED', "moderatedById"=${moderatorId}, "moderatedAt"=now() WHERE "id"=${row.id}`,
    ).rejects.toThrow();
    await expect(
      db.experience.update({
        where: { id: row.id },
        data: {
          status: 'REJECTED',
          moderatedById: moderatorId,
          moderatedAt: new Date(),
          moderationNote: '  ',
        },
      }),
    ).rejects.toThrow();
    const rejected = await db.experience.update({
      where: { id: row.id },
      data: {
        status: 'REJECTED',
        moderatedById: moderatorId,
        moderatedAt: new Date(),
        moderationNote: 'Eksik açıklama',
      },
    });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.publishedAt).toBeNull();
  });
  it('yayın kararı ve anonimleştirme mümkün; yazar bağı kopan içerik anonim olmak zorundadır', async () => {
    const row = await db.experience.create({
      data: {
        ...pending(),
        status: 'PUBLISHED',
        moderatedById: moderatorId,
        moderatedAt: new Date(),
        publishedAt: new Date(),
      },
    });
    await expect(
      db.experience.update({ where: { id: row.id }, data: { authorId: null } }),
    ).rejects.toThrow();
    const detached = await db.experience.update({
      where: { id: row.id },
      data: { authorId: null, isAnonymous: true },
    });
    expect(detached.authorId).toBeNull();
    expect(detached.status).toBe('PUBLISHED');
    await expect(
      db.experience.create({
        data: { departmentIdAtWrite, type: 'INTERNSHIP', isAnonymous: true },
      }),
    ).rejects.toThrow();
  });
  it('türle uyuşmayan alanlar taslakta bile reddedilir', async () => {
    for (const data of [
      { type: 'CERTIFICATE' as const, pay: 'PAID' as const },
      { type: 'ERASMUS' as const, companyId: 'other-kind' },
      { type: 'CLUB' as const, country: 'Almanya' },
      { type: 'CERTIFICATE' as const, interviewQuestions: ['x'] },
      { type: 'CERTIFICATE' as const, processSteps: [{ title: 'x', description: 'x' }] },
    ])
      await expect(
        db.experience.create({ data: { authorId, departmentIdAtWrite, ...data } }),
      ).rejects.toThrow();
    await expect(
      db.experience.create({
        data: { ...pending(), type: 'ERASMUS', pay: null, interviewQuestions: [], country: null },
      }),
    ).rejects.toThrow();
  });
  it('doğrudan SQL yıl, süre ve metin sınırını aşamaz', async () => {
    const row = await draft();
    await expect(
      db.$executeRaw`UPDATE "Experience" SET "termYear"=2101 WHERE "id"=${row.id}`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE "Experience" SET "durationWeeks"=0 WHERE "id"=${row.id}`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE "Experience" SET "organizationName"='' WHERE "id"=${row.id}`,
    ).rejects.toThrow();
    await expect(
      db.experience.update({ where: { id: row.id }, data: { advice: 'x'.repeat(10001) } }),
    ).rejects.toThrow();
  });
  it('processSteps nesne/dizi şekli ve eleman sınırı DB’de de korunur', async () => {
    const row = await draft();
    for (const processSteps of [
      {},
      [null],
      [{ title: 'x' }],
      [{ title: 'x', description: 'y', authorId: 'sızma' }],
      [{ title: 'x', description: '' }],
      Array.from({ length: 21 }, () => ({ title: 'x', description: 'y' })),
    ])
      await expect(
        db.experience.update({
          where: { id: row.id },
          data: { processSteps: processSteps as Prisma.InputJsonValue },
        }),
      ).rejects.toThrow();
    await expect(
      db.experience.update({ where: { id: row.id }, data: { processSteps: Prisma.JsonNull } }),
    ).rejects.toThrow();
  });
  it('interviewQuestions NULL, NULL elemanı, çok boyutlu ve aşırı uzun diziyi reddeder', async () => {
    const row = await draft();
    await expect(
      db.$executeRaw`UPDATE "Experience" SET "interviewQuestions"=NULL WHERE "id"=${row.id}`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE "Experience" SET "interviewQuestions"=ARRAY[NULL]::text[] WHERE "id"=${row.id}`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE "Experience" SET "interviewQuestions"=ARRAY[ARRAY['x','y']]::text[] WHERE "id"=${row.id}`,
    ).rejects.toThrow();
    await expect(
      db.experience.update({
        where: { id: row.id },
        data: { interviewQuestions: Array(21).fill('x') },
      }),
    ).rejects.toThrow();
    await expect(
      db.experience.update({
        where: { id: row.id },
        data: { interviewQuestions: ['x'.repeat(1001)] },
      }),
    ).rejects.toThrow();
  });
  it('şikâyet hedefi gerçek deneyimdir; kısa gerekçe reddedilir', async () => {
    const row = await draft();
    await expect(
      db.report.create({
        data: { targetId: randomUUID(), reporterId: authorId, reason: 'Gerekçe' },
      }),
    ).rejects.toThrow();
    await expect(
      db.report.create({ data: { targetId: row.id, reporterId: authorId, reason: '  ' } }),
    ).rejects.toThrow();
  });
  it('eşzamanlı çift şikâyetten yalnız biri açılır; kapanınca yeni kayıt mümkün', async () => {
    const row = await draft();
    const data = { targetId: row.id, reporterId: authorId, reason: 'Yanıltıcı içerik' };
    const result = await Promise.allSettled([
      db.report.create({ data }),
      db.report.create({ data }),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const report = await db.report.findFirstOrThrow({ where: { targetId: row.id } });
    await expect(
      db.report.update({ where: { id: report.id }, data: { status: 'DISMISSED' } }),
    ).rejects.toThrow();
    await db.report.update({
      where: { id: report.id },
      data: {
        status: 'DISMISSED',
        reviewedById: moderatorId,
        reviewedAt: new Date(),
        resolutionNote: 'İhlal bulunamadı',
      },
    });
    expect((await db.report.create({ data })).status).toBe('OPEN');
  });
  it('deneyim silinince şikâyet de temizlenir, diğer deneyim korunur', async () => {
    const row = await draft();
    const other = await draft();
    await db.report.create({ data: { targetId: row.id, reporterId: authorId, reason: 'Gerekçe' } });
    await db.experience.delete({ where: { id: row.id } });
    expect(await db.report.count({ where: { targetId: row.id } })).toBe(0);
    expect(await db.experience.count({ where: { id: other.id } })).toBe(1);
  });
});

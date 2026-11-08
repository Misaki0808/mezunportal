import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { interviewQuerySchema } from '@/contracts/interview-questions';
import { questionSimilarity } from '../rules/questionDedupe';
import { getInterviewQuestions } from './interview-questions';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const filters = (companyId: string) => interviewQuerySchema.parse({ companyId });
async function fixture() {
  const institution = await createInstitution(db);
  const other = await createInstitution(db);
  const viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2023,
  });
  await grantRequiredConsents(db, viewer);
  const key = randomUUID();
  const company = await db.company.create({
    data: { name: `Şirket ${key}`, normalizedName: key, aliases: [] },
    select: { id: true },
  });
  const authors = await Promise.all([0, 1, 2].map(() => createUser(db, { name: 'Deniz Yılmaz' })));
  const moderator = await createUser(db);
  return { institution, other, viewer, company, authors, moderator };
}
async function addExperience(
  w: Awaited<ReturnType<typeof fixture>>,
  author: string,
  departmentId: string,
  questions: string[],
  anonymous = true,
) {
  return db.experience.create({
    data: {
      authorId: author,
      departmentIdAtWrite: departmentId,
      companyId: w.company.id,
      organizationName: 'Şirket',
      type: 'INTERNSHIP',
      termYear: 2025,
      termSeason: 'SUMMER',
      durationWeeks: 8,
      pay: 'PAID',
      applicationChannel: 'REFERRAL',
      status: 'PUBLISHED',
      moderatedAt: new Date(),
      moderatedById: w.moderator,
      publishedAt: new Date(),
      whatLearned: 'Öğrendim',
      advice: 'Çalışın',
      isAnonymous: anonymous,
      interviewQuestions: questions,
      processSteps: [{ title: 'Süreç', description: 'Takımda nasıl çalışırsın?' }],
    },
    select: { id: true },
  });
}
it('anonim soru gruplanır, kimlikli sorular düşer; K-07 ve hesap durumları her sorguda uygulanır', async () => {
  const w = await fixture();
  const personal = ['Denizʼin cevabı nedir?', 'Mail: biri@ornek.test'];
  const rows = [];
  for (const author of w.authors)
    rows.push(await addExperience(w, author, w.institution.deptA1, ['SQL nedir?', ...personal]));
  const foreign = await createUser(db, { name: 'Yabancı Kişi' });
  await addExperience(w, foreign, w.other.deptA1, ['Yabancı gizli soru?']);
  for (let i = 0; i < 2; i++) {
    const otherAuthor = await createUser(db, { name: `Başka Kullanıcı ${i}` });
    await addExperience(w, otherAuthor, w.other.deptA1, ['Yabancı gizli soru?']);
  }
  let result = await getInterviewQuestions(db, w.viewer, filters(w.company.id));
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0]!.questions).toEqual(
    expect.arrayContaining([
      { text: 'SQL nedir?', count: 3, category: 'QUESTION' },
      { text: 'Takımda nasıl çalışırsın?', count: 3, category: 'PROCESS' },
    ]),
  );
  expect(JSON.stringify(result)).not.toMatch(/Deniz|@ornek|Yabancı gizli|authorId/);
  const sector = await db.sector.create({
    data: { name: 'Test sektör', normalizedName: randomUUID() },
  });
  await db.company.update({ where: { id: w.company.id }, data: { sectorId: sector.id } });
  expect(
    (await getInterviewQuestions(db, w.viewer, { ...filters(w.company.id), sectorId: sector.id }))
      .groups,
  ).toHaveLength(1);
  expect(
    (await getInterviewQuestions(db, w.viewer, { ...filters(w.company.id), sectorId: 'olmayan' }))
      .groups,
  ).toEqual([]);
  expect(
    (await getInterviewQuestions(db, w.viewer, { ...filters(w.company.id), q: 'yoktur' })).groups,
  ).toEqual([]);
  for (const author of w.authors) expect(JSON.stringify(result)).not.toContain(author);
  await db.user.update({ where: { id: w.authors[0]! }, data: { banned: true } });
  result = await getInterviewQuestions(db, w.viewer, filters(w.company.id));
  expect(result.groups).toEqual([]);
  expect(result.insufficient).toBe(true);
  await db.user.update({ where: { id: w.authors[0]! }, data: { banned: false } });
  await db.experience.update({
    where: { id: rows[0]!.id },
    data: { status: 'DRAFT', moderatedAt: null, moderatedById: null, publishedAt: null },
  });
  expect((await getInterviewQuestions(db, w.viewer, filters(w.company.id))).groups).toEqual([]);
  await db.experience.update({
    where: { id: rows[0]!.id },
    data: {
      status: 'PUBLISHED',
      moderatedAt: new Date(),
      moderatedById: w.moderator,
      publishedAt: new Date(),
    },
  });
  await db.user.update({ where: { id: w.authors[1]! }, data: { deletedAt: new Date() } });
  expect((await getInterviewQuestions(db, w.viewer, filters(w.company.id))).groups).toEqual([]);
});
it('trigram hesabı PostgreSQL pg_trgm ile aynı eşiği kullanır', async () => {
  for (const [a, b] of [
    ['sql nedir', 'sql nedir'],
    ['takim calismasi', 'takim calismasi nasil'],
    ['staj sorusu', 'is gorusmesi'],
  ]) {
    const rows = await db.$queryRaw<
      { value: number }[]
    >`SELECT similarity(${a}, ${b})::float8 AS value`;
    expect(questionSimilarity(a!, b!)).toBeCloseTo(rows[0]!.value, 5);
  }
});
it('başka bir kaynak yazarın adını üç kişi tekrarlasa bile soru yayımlanmaz', async () => {
  const w = await fixture();
  const named = await createUser(db, { name: 'Nehir Akın' });
  await addExperience(w, named, w.institution.deptA1, []);
  for (const author of w.authors) {
    await addExperience(w, author, w.institution.deptA1, ['Néhirʼin görüşü nedir?']);
  }
  const result = await getInterviewQuestions(db, w.viewer, filters(w.company.id));
  expect(JSON.stringify(result)).not.toContain('Néhir');
});
it('1000 deneyimde sorgu yanıtı ölçülür', async () => {
  const w = await fixture();
  await db.experience.createMany({
    data: Array.from({ length: 1000 }, (_, index) => ({
      authorId: w.authors[index % 3]!,
      departmentIdAtWrite: w.institution.deptA1,
      companyId: w.company.id,
      organizationName: 'Şirket',
      type: 'INTERNSHIP' as const,
      termYear: 2025,
      termSeason: 'SUMMER' as const,
      durationWeeks: 8,
      pay: 'PAID' as const,
      applicationChannel: 'REFERRAL' as const,
      status: 'PUBLISHED' as const,
      moderatedAt: new Date(),
      moderatedById: w.moderator,
      publishedAt: new Date(),
      whatLearned: 'Öğrendim',
      advice: 'Çalışın',
      interviewQuestions: [`SQL nedir ${index}?`],
    })),
  });
  const start = performance.now();
  const result = await getInterviewQuestions(db, w.viewer, filters(w.company.id));
  const duration = Math.round(performance.now() - start);
  console.info(`soru bankası 1000 deneyim: ${duration} ms`);
  expect(result.groups.length).toBeGreaterThan(0);
  expect(duration).toBeLessThan(5000);
}, 15000);

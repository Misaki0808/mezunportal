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
import { getInterviewQuestions } from './interview-questions';
import { getCompany, companySlug } from './companies';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
async function fixture() {
  const inst = await createInstitution(db),
    viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    role: 'STUDENT',
    departmentId: inst.deptA1,
    entryYear: 2024,
  });
  await grantRequiredConsents(db, viewer);
  const id = randomUUID();
  const company = await db.company.create({
    data: { name: 'Örnek ' + id, normalizedName: id, aliases: [] },
  });
  const context = await createUser(db, { name: 'Nehir Akın' });
  const authors = await Promise.all(
    ['Yasemin Demir', 'Burak Çetin', 'Gökçe Uslu'].map((name) => createUser(db, { name })),
  );
  const add = async (authorId: string, questions: string[]) => {
    const row = await db.experience.create({
      data: {
        authorId,
        companyId: company.id,
        organizationName: company.name,
        departmentIdAtWrite: inst.deptA1,
        isAnonymous: true,
        type: 'INTERNSHIP',
        termYear: 2025,
        termSeason: 'SUMMER',
        durationWeeks: 8,
        pay: 'PAID',
        applicationChannel: 'REFERRAL',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        moderatedAt: new Date(),
        moderatedById: viewer,
        whatLearned: 'Örnek deneyim',
        advice: 'Genel öneri',
        interviewQuestions: questions,
      },
    });
    await db.adminAuditLog.create({
      data: {
        actorId: viewer,
        action: 'MODERATION_PUBLISH',
        targetType: 'EXPERIENCE',
        targetId: row.id,
      },
    });
    return row;
  };
  return {
    inst,
    viewer,
    company,
    context,
    authors,
    add,
    query: interviewQuerySchema.parse({ companyId: company.id }),
  };
}
it('başka kaynak yazarın Unicode adı, e-posta ve telefon türev soru ve süreçten düşer', async () => {
  const w = await fixture();
  await w.add(w.context, []);
  const unsafe = [
    'Néhirʼin görüşü nasıldı?',
    'Ｎｅｈｉｒ nasıl cevap verdi?',
    'N e h i r ne sordu?',
    'Nehir Akın sorusu nedir?',
    'İletişim biri@example.invalid',
    'Telefon +90 532 123 45 67',
    'Tam genişlik ０５３２１２３４５６７',
    'Telefon 0 5 3 2 1 2 3 4 5 6 7',
    'E-posta b i r i @ e x a m p l e . i n v a l i d',
  ];
  for (const author of w.authors) {
    const e = await w.add(author, ['SQL nedir?', ...unsafe]);
    await db.experience.update({
      where: { id: e.id },
      data: {
        processSteps: [{ title: 'Süreç', description: 'Néhirʼin değerlendirmesi nasıldı?' }],
      },
    });
  }
  const result = await getInterviewQuestions(db, w.viewer, w.query);
  expect(result.groups.flatMap((g) => g.questions)).toEqual([
    { text: 'SQL nedir?', count: 3, category: 'QUESTION' },
  ]);
  expect(JSON.stringify(result)).not.toMatch(/Néhir|Ｎｅｈｉｒ|N e h i r|@example|532/);
});
it('kimlik kapısı başka kaynak yazar askıya alınınca adını sorularda açmaz', async () => {
  const w = await fixture();
  await w.add(w.context, []);
  for (const author of w.authors) await w.add(author, ['SQL nedir?', 'Néhirʼin görüşü nasıldı?']);
  const before = await getInterviewQuestions(db, w.viewer, w.query);
  expect(JSON.stringify(before)).not.toContain('Néhir');
  await db.user.update({ where: { id: w.context }, data: { banned: true } });
  const after = await getInterviewQuestions(db, w.viewer, w.query);
  expect(after).toEqual(before);
});
it('kimlik kapısı bağlamdaki deneyim geri çekilince başka yazarların sorusunu açmaz', async () => {
  const w = await fixture();
  const context = await w.add(w.context, []);
  for (const author of w.authors) await w.add(author, ['SQL nedir?', 'Néhirʼin görüşü nasıldı?']);
  const before = await getInterviewQuestions(db, w.viewer, w.query);
  await db.experience.update({
    where: { id: context.id },
    data: { status: 'DRAFT', publishedAt: null, moderatedAt: null, moderatedById: null },
  });
  expect(await getInterviewQuestions(db, w.viewer, w.query)).toEqual(before);
});

it('k=2→3 soru eşiği ve şirket kesitleri birlikte anonim yazarı ayırt ettirmez; kaynak silinince soru düşer', async () => {
  const w = await fixture();
  const rows = [];
  for (const userId of w.authors.slice(0, 2)) rows.push(await w.add(userId, ['SQL nedir?']));
  expect((await getInterviewQuestions(db, w.viewer, w.query)).groups).toEqual([]);
  rows.push(await w.add(w.authors[2]!, ['SQL nedir?']));
  const slug = companySlug(w.company.name, w.company.id);
  const before = {
    bank: await getInterviewQuestions(db, w.viewer, w.query),
    company: await getCompany({ db }, w.viewer, slug),
  };
  expect(before.bank.groups[0]?.questions).toEqual([
    { text: 'SQL nedir?', category: 'QUESTION', count: 3 },
  ]);
  expect(before.company.alumni).toEqual({ current: null, former: null });
  expect(before.company.mentors).toEqual([]);
  expect(before.company.periods).toEqual([]);
  const alternative = await createUser(db, { name: 'Hakan Sezer' });
  await db.experience.update({ where: { id: rows[2]!.id }, data: { authorId: alternative } });
  expect({
    bank: await getInterviewQuestions(db, w.viewer, w.query),
    company: await getCompany({ db }, w.viewer, slug),
  }).toEqual(before);
  await db.experience.delete({ where: { id: rows[2]!.id } });
  const after = await getInterviewQuestions(db, w.viewer, w.query);
  expect(after.groups).toEqual([]);
  expect(after.insufficient).toBe(true);
});

it('hiç yayımlanmamış özel taslak kimlik bağlamını zehirleyip diğer soruları bastıramaz', async () => {
  const w = await fixture();
  for (const author of w.authors) await w.add(author, ['SQL nedir?']);
  const before = await getInterviewQuestions(db, w.viewer, w.query);
  const privateUser = await createUser(db, { name: 'SQL' });
  await db.experience.create({
    data: {
      authorId: privateUser,
      companyId: w.company.id,
      departmentIdAtWrite: w.inst.deptA1,
      type: 'INTERNSHIP',
      organizationName: w.company.name,
      whatLearned: 'Özel taslak',
      advice: 'Not',
    },
  });
  expect(await getInterviewQuestions(db, w.viewer, w.query)).toEqual(before);
});

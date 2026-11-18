import { createHash } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { matchingDirectoryText } from '@/server/repositories/turkish-filters';
import { alumniSearchSchema } from '@/contracts/alumni-directory';
import { searchAlumni } from '@/server/services/alumni-directory';
import { searchMentors } from '@/server/services/mentor-directory';
import { searchMentorsSchema } from '@/contracts/mentor-directory';
import { settleEvents } from '@/server/services/event';
import { loadActor } from '@/server/permissions/actor';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser } from '@/test/fixtures';
import { queryCounter } from '@/test/query-counter';

const db = createTestPrisma();
// Mutlak süre eşiği yük altında anlamsızdır (makine yüklüyken 8 koşunun 5'i kırmızıydı, kart 442). Bunun yerine:
// (1) sorgu sayısı: veri büyüklüğünden ve yükten bağımsız, N+1 gibi gerilemeyi yakalar (ölçülen: mezun 6, mentor 7;
//     sayfa başına N+1 en az 24 sorgu ekler, payı iki sorgu);
// (2) aynı döngüde ölçülen başvuru sorgusuna medyan oranı: yük ikisini de yavaşlatır, ama tam aynı oranda değil.
//     Ölçülen: yüksüz 10-15, 60 `yes` ile yüklü (yük ortalaması ~130) mezun 26-31, mentor 12-17. Sınır bunun üstünde
//     geniş tutuldu; yalnız büyük gerilemeyi (ör. indeksin kaybı, ikinci dereceden büyüme) yakalar, küçüğünü değil.
// Mutlak p95 yalnız bilgi olarak yazılır.
const MAX_ALUMNI_QUERIES = 8;
const MAX_MENTOR_QUERIES = 9;
const MAX_MEDIAN_RATIO = 80;
// Seçici şirket/unvan sorgularında indeks bekçisi (yük ve veri hızından bağımsız): sıralı tarama kapatılınca (`SET LOCAL
// enable_seqscan = off`) planda beklenen GIN indeksleri bulunmalı. İfadeyi indeksten kaçıran değişiklik (örn.
// `tr_ascii(sütun || '')`) planlayıcının elinde bu indeksi bırakmaz; sonuç aynı kalır, test kırmızı olur. Her sorgunun üç
// dalı var: ham ad (pozisyon), sözlük adı ve sözlük `normalizedName` (kart 442, R2 incelemesi B1).
const COMPANY_INDEXES = [
  'Position_company_tr_ascii_trgm',
  'Company_name_tr_ascii_trgm',
  'Company_normalizedName_trgm',
];
const TITLE_INDEXES = [
  'Position_title_tr_ascii_trgm',
  'Title_name_tr_ascii_trgm',
  'Title_normalizedName_trgm',
];
/** `EXPLAIN (FORMAT JSON)` çıktısındaki bütün `Index Name` değerleri (iç içe düğümler dahil). */
function indexNames(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(indexNames);
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) =>
    key === 'Index Name' && typeof value === 'string' ? [value] : indexNames(value),
  );
}
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const p95Of = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;
afterAll(async () => {
  await settleEvents();
  await db.$disconnect();
});
it('5.000 mezun/mentor: Türkçe katlanmış dizin sorguları sabit sorgu sayısında ve başvuru sorgusuna oranla sınırlı kalır', async () => {
  const institution = await createInstitution(db);
  const viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2020,
  });
  const sector = await db.sector.create({
    data: { name: 'Deneme Havacılık', normalizedName: 'deneme havacilik' },
  });
  for (let batch = 0; batch < 10; batch++) {
    const users = await db.user.createManyAndReturn({
      data: Array.from({ length: 500 }, (_, n) => ({
        id: `10000000-0000-4000-8000-${String(batch * 500 + n).padStart(12, '0')}`,
        name: `Deneme Mezun ${batch * 500 + n}`,
        email: `perf-alumni-${batch}-${n}@example.test`,
        emailVerified: true,
      })),
      select: { id: true },
    });
    await db.membership.createMany({
      data: users.map((u) => ({
        userId: u.id,
        departmentId: institution.deptA1,
        role: 'ALUMNI',
        verificationStatus: 'VERIFIED',
        verificationMethod: 'GRADUATION_DOCUMENT',
        verifiedAt: new Date(),
        verifiedById: viewer,
        graduationYear: 2020,
      })),
    });
    await db.profile.createMany({
      data: users.map((u) => ({ userId: u.id, alumniDirectoryVisible: true, city: 'İstanbul' })),
    });
    await db.position.createMany({
      data: users.map((u) => ({
        userId: u.id,
        sectorId: sector.id,
        companyRaw: 'Deneme Havayolu',
        titleRaw: 'Analist',
        source: 'MANUAL',
        isCurrent: true,
      })),
    });
    await db.mentorProfile.createMany({
      data: users.map((u) => ({
        userId: u.id,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        monthlyCapacity: 4,
        sessionMinutes: 30,
      })),
    });
  }
  // Aynı metinleri taşıyan başka üniversite: uygulamaya taşınan kimliklerin kapsamı da ölçülür.
  const foreign = await createInstitution(db);
  const foreignUsers = await db.user.createManyAndReturn({
    data: Array.from({ length: 5000 }, (_, n) => ({
      name: `Deneme Yabancı ${n}`,
      email: `perf-foreign-${n}@example.test`,
      emailVerified: true,
    })),
    select: { id: true },
  });
  await db.membership.createMany({
    data: foreignUsers.map((u) => ({
      userId: u.id,
      departmentId: foreign.deptA1,
      role: 'ALUMNI',
      verificationStatus: 'VERIFIED',
      verificationMethod: 'GRADUATION_DOCUMENT',
      verifiedAt: new Date(),
      verifiedById: viewer,
      graduationYear: 2020,
    })),
  });
  await db.profile.createMany({
    data: foreignUsers.map((u) => ({
      userId: u.id,
      alumniDirectoryVisible: true,
      city: 'İstanbul',
    })),
  });
  await db.position.createMany({
    data: foreignUsers.map((u) => ({
      userId: u.id,
      companyRaw: 'Deneme Havayolu',
      titleRaw: 'Analist',
      isCurrent: true,
      source: 'MANUAL',
    })),
  });
  await db.$executeRaw`ANALYZE`;
  const actor = (await loadActor(db, viewer, new Date()))!;
  const filter = alumniSearchSchema.parse({
    q: 'DENEME',
    sectorId: sector.id,
    company: 'Deneme',
    title: 'Analist',
    city: 'İstanbul',
    graduationFrom: 2019,
    graduationTo: 2021,
  });
  const counter = queryCounter(db);
  const run = () => searchAlumni(counter.client, actor, filter);
  counter.reset();
  const alumniResult = await run();
  const alumniQueries = counter.count();
  process.stdout.write(`alumni-queries: ${alumniQueries}\n`);
  expect.soft(alumniQueries).toBeLessThanOrEqual(MAX_ALUMNI_QUERIES);
  expect(alumniResult.total).toBe(5000);
  process.stdout.write(
    `alumni-result-sha256: ${createHash('sha256').update(JSON.stringify(alumniResult)).digest('hex')}\n`,
  );
  // Başvuru sorgusu: aramadan bağımsız, aynı tablolarda sıralı tarama. Her turda önce o, sonra arama ölçülür.
  const reference = () =>
    db.$queryRaw`SELECT count(*)::int AS n FROM "Position" WHERE tr_ascii("companyRaw") LIKE '%deneme%'`;
  const referenceSamples: number[] = [];
  const timed = async (samples: number[], work: () => Promise<unknown>) => {
    const start = performance.now();
    await work();
    samples.push(performance.now() - start);
  };
  await reference();
  const samples: number[] = [];
  for (let n = 0; n < 30; n++) {
    await timed(referenceSamples, reference);
    await timed(samples, run);
  }
  const alumniRatio = median(samples) / median(referenceSamples);
  process.stdout.write(
    `alumni-directory: 5000 kişi, 30 ölçüm, p95 ${p95Of(samples).toFixed(1)} ms (bilgi), başvuru medyan ${median(referenceSamples).toFixed(1)} ms, medyan oranı ${alumniRatio.toFixed(1)}\n`,
  );
  expect.soft(alumniRatio).toBeLessThan(MAX_MEDIAN_RATIO);
  const mentorFilter = searchMentorsSchema.parse({
    q: 'DENEME',
    company: 'deneme',
    title: 'analist',
    pageSize: 24,
  });
  const mentorRun = () => searchMentors({ db: counter.client }, actor, mentorFilter);
  // Mevcut mentor tarama tavanı 500; yük kümesi yine 5.000 kişidir.
  counter.reset();
  const mentorResult = await mentorRun();
  const mentorQueries = counter.count();
  process.stdout.write(`mentor-queries: ${mentorQueries}\n`);
  expect.soft(mentorQueries).toBeLessThanOrEqual(MAX_MENTOR_QUERIES);
  expect(mentorResult.items).toHaveLength(24);
  process.stdout.write(
    `mentor-result-sha256: ${createHash('sha256').update(JSON.stringify(mentorResult)).digest('hex')}\n`,
  );
  const mentorReferenceSamples: number[] = [];
  const mentorSamples: number[] = [];
  for (let n = 0; n < 30; n++) {
    await timed(mentorReferenceSamples, reference);
    await timed(mentorSamples, mentorRun);
  }
  const mentorRatio = median(mentorSamples) / median(mentorReferenceSamples);
  process.stdout.write(
    `mentor-directory: 5000 kişi, 30 ölçüm, p95 ${p95Of(mentorSamples).toFixed(1)} ms (bilgi), başvuru medyan ${median(mentorReferenceSamples).toFixed(1)} ms, medyan oranı ${mentorRatio.toFixed(1)}\n`,
  );
  expect.soft(mentorRatio).toBeLessThan(MAX_MEDIAN_RATIO);
  const ids = await matchingDirectoryText(
    db,
    { q: 'DENEME', company: 'Deneme', city: 'İstanbul' },
    [institution.universityId],
  );
  process.stdout.write(
    `scope-candidates: ${JSON.stringify(Object.fromEntries(Object.entries(ids).map(([key, values]) => [key, values.length])))}\n`,
  );

  for (const values of Object.values(ids)) expect.soft(values).toHaveLength(5000);

  // Seçici sorguda ham ad ve sözlük dallarının gerçek planı (üretim planlayıcı ayarlarıyla).
  const companies = await db.company.createManyAndReturn({
    data: Array.from({ length: 5000 }, (_, n) => ({
      name: n === 0 ? 'Nadirşirket A.Ş.' : `Sözlük Kurumu ${n}`,
      normalizedName: n === 0 ? 'nadirsirket' : `sozluk kurumu ${n}`,
    })),
    select: { id: true, normalizedName: true },
  });
  const titles = await db.title.createManyAndReturn({
    data: Array.from({ length: 5000 }, (_, n) => ({
      name: n === 0 ? 'Nadirunvan' : `Sözlük Görevi ${n}`,
      normalizedName: n === 0 ? 'nadirunvan' : `sozluk gorevi ${n}`,
    })),
    select: { id: true, normalizedName: true },
  });
  const user = await db.user.findFirstOrThrow({
    where: { email: 'perf-alumni-0-0@example.test' },
    select: { id: true },
  });
  await db.position.updateMany({
    where: { userId: user.id },
    data: {
      companyRaw: 'Nadirhamkurum',
      titleRaw: 'Nadirhamgorev',
      companyId: companies.find((c) => c.normalizedName === 'nadirsirket')!.id,
      titleId: titles.find((t) => t.normalizedName === 'nadirunvan')!.id,
    },
  });
  await db.$executeRaw`ANALYZE`;
  await db.$executeRaw`VACUUM ANALYZE`;
  for (const { filter, indexes } of [
    { filter: { company: 'nadirhamkurum' }, indexes: COMPANY_INDEXES },
    { filter: { company: 'nadirşirket' }, indexes: COMPANY_INDEXES },
    { filter: { company: 'nadirsirket as' }, indexes: COMPANY_INDEXES },
    { filter: { title: 'nadirhamgorev' }, indexes: TITLE_INDEXES },
    { filter: { title: 'nadirunvan' }, indexes: TITLE_INDEXES },
    { filter: { title: 'nadirunv.' }, indexes: TITLE_INDEXES },
  ]) {
    const queries: Prisma.Sql[] = [];
    const reader = {
      $queryRaw: ((query: Prisma.Sql) => {
        queries.push(query);
        return db.$queryRaw(query);
      }) as PrismaClient['$queryRaw'],
    };
    const matches = await matchingDirectoryText(reader, filter, [institution.universityId]);
    expect.soft(matches.positions).toHaveLength(1);
    const forced = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) ${queries[0]!}`);
    });
    const used = [...new Set(indexNames(forced))].sort();
    process.stdout.write(`directory-index ${JSON.stringify(filter)}: ${used.join(', ')}\n`);
    expect
      .soft(
        indexes.filter((name) => !used.includes(name)),
        `${JSON.stringify(filter)}: planda olmayan indeks`,
      )
      .toEqual([]);
    const plan = await db.$queryRaw(
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queries[0]!}`,
    );
    process.stdout.write(
      `directory-plan ${JSON.stringify(filter)} matches=${matches.positions?.length}: ${JSON.stringify(plan)}\n`,
    );
  }
});

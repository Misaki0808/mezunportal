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

const db = createTestPrisma();
afterAll(async () => {
  await settleEvents();
  await db.$disconnect();
});
it('5.000 mezun/mentor: Türkçe katlanmış gerçek dizin sorgularında p95 300 ms altı', async () => {
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
  const run = () => searchAlumni(db, actor, filter);
  const alumniResult = await run();
  expect(alumniResult.total).toBe(5000);
  process.stdout.write(
    `alumni-result-sha256: ${createHash('sha256').update(JSON.stringify(alumniResult)).digest('hex')}\n`,
  );
  const samples: number[] = [];
  for (let n = 0; n < 30; n++) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
  process.stdout.write(`alumni-directory: 5000 kişi, 30 ölçüm, p95 ${p95.toFixed(1)} ms\n`);
  expect.soft(p95).toBeLessThan(300);
  const mentorFilter = searchMentorsSchema.parse({
    q: 'DENEME',
    company: 'deneme',
    title: 'analist',
    pageSize: 24,
  });
  const mentorRun = () => searchMentors({ db }, actor, mentorFilter);
  // Mevcut mentor tarama tavanı 500; yük kümesi yine 5.000 kişidir.
  const mentorResult = await mentorRun();
  expect(mentorResult.items).toHaveLength(24);
  process.stdout.write(
    `mentor-result-sha256: ${createHash('sha256').update(JSON.stringify(mentorResult)).digest('hex')}\n`,
  );
  const mentorSamples: number[] = [];
  for (let n = 0; n < 30; n++) {
    const start = performance.now();
    await mentorRun();
    mentorSamples.push(performance.now() - start);
  }
  mentorSamples.sort((a, b) => a - b);
  const mentorP95 = mentorSamples[Math.ceil(mentorSamples.length * 0.95) - 1]!;
  process.stdout.write(`mentor-directory: 5000 kişi, 30 ölçüm, p95 ${mentorP95.toFixed(1)} ms\n`);
  expect.soft(mentorP95).toBeLessThan(300);
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
  for (const filter of [
    { company: 'nadirhamkurum' },
    { company: 'nadirşirket' },
    { company: 'nadirsirket as' },
    { title: 'nadirhamgorev' },
    { title: 'nadirunvan' },
    { title: 'nadirunv.' },
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
    const plan = await db.$queryRaw(
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queries[0]!}`,
    );
    process.stdout.write(
      `directory-plan ${JSON.stringify(filter)} matches=${matches.positions?.length}: ${JSON.stringify(plan)}\n`,
    );
  }
});

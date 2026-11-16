import { afterAll, expect, it } from 'vitest';
import { alumniSearchSchema } from '@/contracts/alumni-directory';
import { searchAlumni } from '@/server/services/alumni-directory';
import { loadActor } from '@/server/permissions/actor';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser } from '@/test/fixtures';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('5.000 mezun: gerçek dizin sorgusunda p95 300 ms altı', async () => {
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
  }
  await db.$executeRaw`ANALYZE`;
  const actor = (await loadActor(db, viewer, new Date()))!;
  const filter = alumniSearchSchema.parse({
    sectorId: sector.id,
    company: 'Deneme',
    title: 'Analist',
    city: 'İstanbul',
    graduationFrom: 2019,
    graduationTo: 2021,
  });
  const run = () => searchAlumni(db, actor, filter);
  expect((await run()).total).toBe(5000);
  const samples: number[] = [];
  for (let n = 0; n < 30; n++) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
  process.stdout.write(`alumni-directory: 5000 kişi, 30 ölçüm, p95 ${p95.toFixed(1)} ms\n`);
  expect(p95).toBeLessThan(300);
});

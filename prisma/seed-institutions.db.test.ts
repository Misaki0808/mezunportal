import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma } from '../src/test/db';
import { INSTITUTION_SEED } from './seed-data';
import { seedInstitutions } from './seed-institutions';

const prisma = createTestPrisma();

beforeEach(async () => {
  await prisma.department.deleteMany();
  await prisma.faculty.deleteMany();
  await prisma.university.deleteMany();
});
afterAll(() => prisma.$disconnect());

describe('seedInstitutions', () => {
  it('İÜ → fakülte → YBS zincirini yazar', async () => {
    const { university, faculty, department } = await seedInstitutions(prisma);

    expect(university.shortName).toBe(INSTITUTION_SEED.university.shortName);
    expect(university.studentEmailDomains).toEqual([
      ...INSTITUTION_SEED.university.studentEmailDomains,
    ]);
    expect(university.staffEmailDomains).toEqual([
      ...INSTITUTION_SEED.university.staffEmailDomains,
    ]);
    expect(faculty.universityId).toBe(university.id);
    expect(department.facultyId).toBe(faculty.id);
    expect(department.code).toBe('YBS');
  });

  it('iki kez çalışınca çift kayıt üretmez ve aynı kayıtları döndürür', async () => {
    const first = await seedInstitutions(prisma);
    const second = await seedInstitutions(prisma);

    expect(await prisma.university.count()).toBe(1);
    expect(await prisma.faculty.count()).toBe(1);
    expect(await prisma.department.count()).toBe(1);
    expect(second.university.id).toBe(first.university.id);
    expect(second.faculty.id).toBe(first.faculty.id);
    expect(second.department.id).toBe(first.department.id);
  });

  it('bozulmuş kaydı sabitlerle yeniden eşitler', async () => {
    await seedInstitutions(prisma);
    await prisma.university.updateMany({ data: { studentEmailDomains: ['yanlis.example'] } });
    await prisma.department.updateMany({ data: { name: 'Yanlış Ad' } });

    const { university, department } = await seedInstitutions(prisma);

    expect(university.studentEmailDomains).toEqual([
      ...INSTITUTION_SEED.university.studentEmailDomains,
    ]);
    expect(department.name).toBe(INSTITUTION_SEED.department.name);
  });
});

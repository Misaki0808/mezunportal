import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '../src/test/db';
import { INSTITUTION_SEED } from './seed-data';
import { seedInstitutions } from './seed-institutions';

const prisma = createTestPrisma();

// Diğer test dosyaları aynı veritabanında üyelikler bırakır (bölümler silinemez); bu yüzden kayıtlar
// silinmez, yalnız seed'in doğal anahtarlı kayıtları sınanır.
const seeded = {
  university: { name: INSTITUTION_SEED.university.name },
  faculty: { name: INSTITUTION_SEED.faculty.name, university: INSTITUTION_SEED.university },
  department: {
    code: INSTITUTION_SEED.department.code,
    faculty: { name: INSTITUTION_SEED.faculty.name },
  },
};

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

    expect(await prisma.university.count({ where: seeded.university })).toBe(1);
    expect(await prisma.faculty.count({ where: { name: seeded.faculty.name } })).toBe(1);
    expect(
      await prisma.department.count({
        where: { code: seeded.department.code, faculty: { name: seeded.faculty.name } },
      }),
    ).toBe(1);
    expect(second.university.id).toBe(first.university.id);
    expect(second.faculty.id).toBe(first.faculty.id);
    expect(second.department.id).toBe(first.department.id);
  });

  it('bozulmuş kaydı sabitlerle yeniden eşitler', async () => {
    await seedInstitutions(prisma);
    await prisma.university.updateMany({
      where: seeded.university,
      data: { studentEmailDomains: ['yanlis.example'] },
    });
    await prisma.department.updateMany({
      where: { id: (await seedInstitutions(prisma)).department.id },
      data: { name: 'Yanlış Ad' },
    });

    const { university, department } = await seedInstitutions(prisma);

    expect(university.studentEmailDomains).toEqual([
      ...INSTITUTION_SEED.university.studentEmailDomains,
    ]);
    expect(department.name).toBe(INSTITUTION_SEED.department.name);
  });
});

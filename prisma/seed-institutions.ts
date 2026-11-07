import type { PrismaClient } from '../src/generated/prisma/client';
import { INSTITUTION_SEED } from './seed-data';

/**
 * Kurum yapısını (İÜ → fakülte → YBS) idempotent yazar: doğal anahtarla upsert; aynı seed kaç kez
 * çalışırsa çalışsın tek kayıt kalır ve sabitlerdeki değişiklik güncellenir.
 */
export async function seedInstitutions(prisma: PrismaClient) {
  const { university, faculty, department } = INSTITUTION_SEED;

  const universityRow = await prisma.university.upsert({
    where: { name: university.name },
    create: {
      name: university.name,
      shortName: university.shortName,
      studentEmailDomains: [...university.studentEmailDomains],
      staffEmailDomains: [...university.staffEmailDomains],
    },
    update: {
      shortName: university.shortName,
      studentEmailDomains: [...university.studentEmailDomains],
      staffEmailDomains: [...university.staffEmailDomains],
    },
  });

  const facultyRow = await prisma.faculty.upsert({
    where: { universityId_name: { universityId: universityRow.id, name: faculty.name } },
    create: { universityId: universityRow.id, name: faculty.name },
    update: {},
  });

  const departmentRow = await prisma.department.upsert({
    where: { facultyId_code: { facultyId: facultyRow.id, code: department.code } },
    create: { facultyId: facultyRow.id, name: department.name, code: department.code },
    update: { name: department.name },
  });

  return { university: universityRow, faculty: facultyRow, department: departmentRow };
}

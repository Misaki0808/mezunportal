import type { PrismaClient } from '../src/generated/prisma/client';
import { INSTITUTION_SEED } from './seed-data';
import { YBS_COURSES } from './seed-courses-data';

export async function seedCourses(prisma: PrismaClient) {
  const department = await prisma.department.findFirstOrThrow({
    where: {
      code: INSTITUTION_SEED.department.code,
      faculty: {
        name: INSTITUTION_SEED.faculty.name,
        university: { name: INSTITUTION_SEED.university.name },
      },
    },
    select: { id: true },
  });
  for (const course of YBS_COURSES) {
    await prisma.course.upsert({
      where: {
        departmentId_code_semester: {
          departmentId: department.id,
          code: course.code,
          semester: course.semester,
        },
      },
      create: { departmentId: department.id, ...course },
      update: {},
    });
  }
}

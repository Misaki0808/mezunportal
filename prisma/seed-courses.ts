import type { PrismaClient } from '../src/generated/prisma/client';
import { INSTITUTION_SEED } from './seed-data';
import { YBS_COURSES } from './seed-courses-data';
import { seedId } from './seed-util';

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
    const id = seedId('course', `${department.id}:${course.code}:${course.semester}`);
    const existing = await prisma.course.findFirst({
      where: {
        OR: [{ id }, { departmentId: department.id, code: course.code, semester: course.semester }],
      },
      select: { id: true },
    });
    if (!existing)
      await prisma.course.create({ data: { id, departmentId: department.id, ...course } });
  }
}

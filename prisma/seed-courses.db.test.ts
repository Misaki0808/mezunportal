import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { seedInstitutions } from './seed-institutions';
import { seedCourses } from './seed-courses';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('liste 89 kayıtla idempotent eklenir ve yönetici düzeltmesi tekrar seed ile geri alınmaz', async () => {
  const { department } = await seedInstitutions(db);
  await seedCourses(db);
  const row = await db.course.findFirstOrThrow({
    where: { departmentId: department.id, code: 'YBSB1003' },
  });
  await db.course.update({
    where: { id: row.id },
    data: { code: 'YBSB1003-D', name: 'Düzeltilmiş ders' },
  });
  await seedCourses(db);
  expect(await db.course.count({ where: { departmentId: department.id } })).toBe(89);
  expect(await db.course.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
    code: 'YBSB1003-D',
    name: 'Düzeltilmiş ders',
  });
});

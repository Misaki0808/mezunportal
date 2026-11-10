import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { buildDataExport } from './dataExport';
import { deleteAccount } from './accountDeletion';
import { listAlumniCourses, listCourseGuide, saveAlumniCourses } from './course-guide';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('dersler bölümle sınırlıdır; beş sınırı, k eşiği, döküm ve hesap silme korunur', async () => {
  const institution = await createInstitution(db);
  const student = await createUser(db);
  await addMembership(db, {
    userId: student,
    departmentId: institution.deptA1,
    role: 'STUDENT',
    entryYear: 2023,
  });
  await grantRequiredConsents(db, student);
  const courses = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      db.course.create({
        data: {
          departmentId: institution.deptA1,
          code: `TEST${i}`,
          name: `Ders ${i}`,
          semester: i,
          elective: true,
        },
      }),
    ),
  );
  const outside = await db.course.create({
    data: {
      departmentId: institution.deptB1,
      code: 'OUTSIDE',
      name: 'Dış ders',
      semester: 1,
      elective: true,
    },
  });
  const users: string[] = [];
  for (let i = 0; i < 3; i++) {
    const userId = await createUser(db);
    users.push(userId);
    await addMembership(db, {
      userId,
      departmentId: institution.deptA1,
      role: 'ALUMNI',
      graduationYear: 2020,
    });
    await grantRequiredConsents(db, userId);
    await saveAlumniCourses(db, userId, { courseIds: [courses[0]!.id] });
  }
  expect((await listCourseGuide(db, student, {})).find((c) => c.id === courses[0]!.id)?.count).toBe(
    3,
  );
  expect((await listCourseGuide(db, student, {})).some((c) => c.id === outside.id)).toBe(false);
  await expect(
    saveAlumniCourses(db, users[0]!, { courseIds: courses.map((c) => c.id) }),
  ).rejects.toThrow();
  await expect(saveAlumniCourses(db, users[0]!, { courseIds: [outside.id] })).rejects.toMatchObject(
    { code: 'RESOURCE_NOT_FOUND' },
  );
  await saveAlumniCourses(db, users[0]!, { courseIds: courses.slice(0, 5).map((c) => c.id) });
  expect((await listAlumniCourses(db, users[0]!)).selected).toHaveLength(5);
  expect((await buildDataExport(db, users[0]!)).courseMarks).toHaveLength(5);
  const user = await db.user.findUniqueOrThrow({
    where: { id: users[0]! },
    select: { email: true },
  });
  await deleteAccount(
    db,
    users[0]!,
    { publishedContent: 'DELETE', confirmEmail: user.email },
    { removeStoredFiles: null },
  );
  expect(await db.alumniCourseMark.count({ where: { userId: users[0]! } })).toBe(0);
  expect(
    (await listCourseGuide(db, student, {})).find((c) => c.id === courses[0]!.id)?.count,
  ).toBeNull();
});
it('ders sözlüğü değişiklikleri bölüm kapsamını ve işlem kaydını korur', async () => {
  const { addGrant } = await import('@/test/fixtures');
  const { listManagedCourses, saveCourse } = await import('./course-guide');
  const inst = await createInstitution(db);
  const admin = await createUser(db);
  await addMembership(db, { userId: admin, departmentId: inst.deptA1, role: 'ACADEMIC' });
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  await grantRequiredConsents(db, admin);
  const entry = {
    departmentId: inst.deptA1,
    code: 'NEW101',
    name: 'Yeni ders',
    semester: 1,
    elective: true,
  };
  const created = await saveCourse(db, admin, entry);
  await saveCourse(db, admin, { ...entry, id: created.id, name: 'Düzenlenmiş ders' });
  expect((await listManagedCourses(db, admin)).courses.find((c) => c.id === created.id)?.name).toBe(
    'Düzenlenmiş ders',
  );
  expect(
    await db.adminAuditLog.count({ where: { targetId: created.id, action: 'DICTIONARY_CHANGE' } }),
  ).toBe(2);
  await expect(
    saveCourse(db, admin, { ...entry, departmentId: inst.deptB1 }),
  ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
});

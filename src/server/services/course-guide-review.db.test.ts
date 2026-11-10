import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { listAlumniCourses, listCourseGuide, saveAlumniCourses } from './course-guide';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('eşzamanlı iki ayrık beşli kayıt aynı mezunda en çok beş işaret bırakır', async () => {
  const inst = await createInstitution(db),
    user = await createUser(db);
  await addMembership(db, {
    userId: user,
    role: 'ALUMNI',
    departmentId: inst.deptA1,
    graduationYear: 2020,
  });
  await grantRequiredConsents(db, user);
  const courses = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      db.course.create({
        data: {
          departmentId: inst.deptA1,
          code: 'RACE' + i,
          name: 'Ders ' + i,
          semester: 1,
          elective: true,
        },
      }),
    ),
  );
  let release!: () => void, ready!: (pid: number) => void;
  const blocked = new Promise<void>((r) => {
      release = r;
    }),
    locked = new Promise<number>((r) => {
      ready = r;
    });
  const holder = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user} FOR UPDATE`;
      const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      ready(row!.pid);
      await blocked;
    },
    { timeout: 10000 },
  );
  const pid = await locked,
    pending = [
      saveAlumniCourses(db, user, { courseIds: courses.slice(0, 5).map((c) => c.id) }),
      saveAlumniCourses(db, user, { courseIds: courses.slice(5).map((c) => c.id) }),
    ];
  // Her iki gerçek SQL ifadesinin de satır kilidinde beklediğini görmeden kilidi bırakma.
  let count = 0;
  try {
    for (let i = 0; i < 100; i++) {
      const [row] = await db.$queryRaw<{ n: number }[]>`WITH RECURSIVE waiting AS (
 SELECT pid FROM pg_stat_activity WHERE ${pid}::int=ANY(pg_blocking_pids(pid))
 UNION SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid=ANY(pg_blocking_pids(a.pid))
) SELECT count(*)::int AS n FROM waiting`;
      count = row!.n;
      if (count >= 2) break;
      await new Promise((r) => setTimeout(r, 20));
    }
  } finally {
    release();
  }
  await holder;
  const results = await Promise.allSettled(pending);
  expect(count).toBeGreaterThanOrEqual(2);
  expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  expect(await db.alumniCourseMark.count({ where: { userId: user } })).toBe(5);
});
it('sektör hücresi, tamamlayıcısı ve alıcının kendi işareti toplama güvenli biçimde yansır', async () => {
  const inst = await createInstitution(db),
    viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    role: 'STUDENT',
    departmentId: inst.deptA1,
    entryYear: 2024,
  });
  await addMembership(db, {
    userId: viewer,
    role: 'ALUMNI',
    departmentId: inst.deptA1,
    graduationYear: 2020,
  });
  await grantRequiredConsents(db, viewer);
  const course = await db.course.create({
      data: {
        departmentId: inst.deptA1,
        code: 'PRIV',
        name: 'Gizlilik dersi',
        semester: 1,
        elective: true,
      },
    }),
    key = randomUUID(),
    sectors = await Promise.all(
      ['A', 'B'].map((name) =>
        db.sector.create({ data: { name: name + key, normalizedName: name + key } }),
      ),
    ),
    users = [];
  for (let i = 0; i < 6; i++) {
    const userId = await createUser(db);
    users.push(userId);
    await addMembership(db, {
      userId,
      role: 'ALUMNI',
      departmentId: inst.deptA1,
      graduationYear: 2020,
    });
    await grantRequiredConsents(db, userId);
    await db.position.create({
      data: {
        userId,
        companyRaw: 'Kurum',
        titleRaw: 'Uzman',
        source: 'MANUAL',
        isCurrent: true,
        sectorId: sectors[i < 3 ? 0 : 1]!.id,
      },
    });
    if (i < 5) await saveAlumniCourses(db, userId, { courseIds: [course.id] });
  }
  const summary = async () =>
    (await listCourseGuide(db, viewer, {})).find((c) => c.id === course.id)!;
  const before = await summary();
  expect(before.count).toBe(5);
  expect(before.sectors).toEqual([]);
  await saveAlumniCourses(db, viewer, { courseIds: [course.id] });
  expect(await summary()).toEqual(before);
  await saveAlumniCourses(db, users[5]!, { courseIds: [course.id] });
  expect(await summary()).toMatchObject({ count: 6, sectors: sectors.map((s) => s.name) });
  await db.user.update({ where: { id: users[5]! }, data: { banned: true } });
  expect(await summary()).toMatchObject({ count: 5, sectors: [] });
});

it('bölüm değiştiren mezunun seçicisinde yalnız etkin bölümün işaretleri bulunur', async () => {
  const inst = await createInstitution(db),
    userId = await createUser(db);
  const old = await addMembership(db, {
    userId,
    role: 'ALUMNI',
    departmentId: inst.deptA1,
    graduationYear: 2020,
  });
  await grantRequiredConsents(db, userId);
  const course = await db.course.create({
    data: {
      departmentId: inst.deptA1,
      code: 'OLD',
      name: 'Eski bölüm dersi',
      semester: 1,
      elective: true,
    },
  });
  await saveAlumniCourses(db, userId, { courseIds: [course.id] });
  await addMembership(db, {
    userId,
    role: 'ALUMNI',
    departmentId: inst.deptA2,
    graduationYear: 2021,
  });
  await db.membership.update({ where: { id: old }, data: { endedAt: new Date() } });
  const result = await listAlumniCourses(db, userId);
  expect(result.selected.every((id) => result.courses.some((c) => c.id === id))).toBe(true);
});

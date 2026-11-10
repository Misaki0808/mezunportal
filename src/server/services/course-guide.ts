import 'server-only';

import {
  courseFilterSchema,
  courseSelectionSchema,
  type CourseFilterInput,
  type CourseSelectionInput,
} from '@/contracts/course-guide';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { codedNotFound } from '@/lib/errors';
import { createPermissions } from '../permissions/guards';
import { summarizeCourseMarks } from '../rules/courseGuide';
import { requireConsent } from './privacy';
import { notSuspended } from './mentor-directory';

type Tx = Prisma.TransactionClient;
type Role = 'STUDENT' | 'ALUMNI';
async function asMember<T>(
  db: PrismaClient,
  userId: string,
  role: Role,
  run: (tx: Tx, departments: string[], now: Date) => Promise<T>,
  isolationLevel: 'RepeatableRead' | 'ReadCommitted' = 'RepeatableRead',
) {
  const now = new Date();
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const actor = await createPermissions({
        db: () => tx,
        getSessionUserId: async () => userId,
        now: () => now,
      }).requireVerifiedMember({ roles: [role] });
      await requireConsent(tx, userId);
      const departments = actor.facts.memberships
        .filter((m) => m.role === role && m.verificationStatus === 'VERIFIED' && m.endedAt === null)
        .map((m) => m.departmentId);
      return run(tx, departments, now);
    },
    { isolationLevel, timeout: 20000, maxWait: 10000 },
  );
}

export async function listAlumniCourses(db: PrismaClient, userId: string) {
  return asMember(db, userId, 'ALUMNI', async (tx, departments) => {
    const [courses, marks] = await Promise.all([
      tx.course.findMany({
        where: { departmentId: { in: departments } },
        orderBy: [{ elective: 'desc' }, { semester: 'asc' }, { name: 'asc' }],
      }),
      tx.alumniCourseMark.findMany({
        where: { userId, course: { departmentId: { in: departments } } },
        select: { courseId: true },
      }),
    ]);
    return { courses, selected: marks.map((m) => m.courseId) };
  });
}

export async function saveAlumniCourses(
  db: PrismaClient,
  userId: string,
  input: CourseSelectionInput,
) {
  const { courseIds } = courseSelectionSchema.parse(input);
  // Kilit bekledikten sonra önceki yazarın eklediği işaretler de görülüp değiştirilmelidir.
  return asMember(
    db,
    userId,
    'ALUMNI',
    async (tx, departments) => {
      const count = await tx.course.count({
        where: { id: { in: courseIds }, departmentId: { in: departments } },
      });
      if (count !== courseIds.length) throw codedNotFound('RESOURCE_NOT_FOUND');
      await tx.alumniCourseMark.deleteMany({ where: { userId } });
      if (courseIds.length)
        await tx.alumniCourseMark.createMany({
          data: courseIds.map((courseId) => ({ userId, courseId })),
        });
      return { saved: true as const };
    },
    'ReadCommitted',
  );
}

export async function listCourseGuide(db: PrismaClient, userId: string, input: CourseFilterInput) {
  const filter = courseFilterSchema.parse(input);
  return asMember(db, userId, 'STUDENT', async (tx, departments, now) => {
    const courses = await tx.course.findMany({
      where: {
        departmentId: { in: departments },
        ...(filter.semester === undefined ? {} : { semester: filter.semester }),
        ...(filter.elective === undefined ? {} : { elective: filter.elective }),
        ...(filter.query ? { name: { contains: filter.query, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        semester: true,
        elective: true,
        departmentId: true,
      },
      orderBy: [{ elective: 'desc' }, { semester: 'asc' }, { name: 'asc' }],
    });
    const marks = await tx.alumniCourseMark.findMany({
      where: {
        userId: { not: userId },
        courseId: { in: courses.map((c) => c.id) },
        user: { deletedAt: null, ...notSuspended(now) },
      },
      select: {
        courseId: true,
        user: {
          select: {
            memberships: {
              where: { role: 'ALUMNI', endedAt: null, verificationStatus: 'VERIFIED' },
              select: { departmentId: true },
            },
            positions: {
              where: { isCurrent: true },
              select: { sector: { select: { name: true } } },
              orderBy: [
                { startYear: { sort: 'desc', nulls: 'last' } },
                { startMonth: { sort: 'desc', nulls: 'last' } },
                { id: 'asc' },
              ],
              take: 1,
            },
          },
        },
      },
    });
    return courses.map((course) => {
      const relevant = marks.filter(
        (m) =>
          m.courseId === course.id &&
          m.user.memberships.some((m) => m.departmentId === course.departmentId),
      );
      const sectors = new Map<string, number>();
      for (const mark of relevant) {
        const name = mark.user.positions[0]?.sector?.name;
        if (name) sectors.set(name, (sectors.get(name) ?? 0) + 1);
      }
      const summary = summarizeCourseMarks(
        relevant.length,
        [...sectors].map(([name, count]) => ({ name, count })),
      );
      return {
        id: course.id,
        code: course.code,
        name: course.name,
        semester: course.semester,
        elective: course.elective,
        ...summary,
      };
    });
  });
}

/** Yönetici yalnız kendi kapsamındaki bölüm sözlüğünü değiştirebilir; kayıt aynı işlemdedir. */
export async function listManagedCourses(db: PrismaClient, userId: string) {
  const { readAsAdmin } = await import('./admin-access');
  return readAsAdmin({ db }, userId, 'ANY_ADMIN', async ({ tx, departmentIds }) => {
    const [departments, courses] = await Promise.all([
      tx.department.findMany({
        where: { id: { in: departmentIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      tx.course.findMany({
        where: { departmentId: { in: departmentIds } },
        orderBy: [{ semester: 'asc' }, { name: 'asc' }],
      }),
    ]);
    return { departments, courses };
  });
}
export async function saveCourse(
  db: PrismaClient,
  userId: string,
  input: import('@/contracts/course-guide').SaveCourseInput,
) {
  const { saveCourseSchema } = await import('@/contracts/course-guide');
  const { loadAnyAdmin, covers } = await import('./admin-access');
  const { recordAdminAction } = await import('./audit');
  const { codedForbidden } = await import('@/lib/errors');
  const { id, ...data } = saveCourseSchema.parse(input);
  return db.$transaction(async (tx) => {
    const actor = await loadAnyAdmin(tx, userId, new Date());
    if (!(await covers(tx, actor, data.departmentId))) throw codedForbidden('AUTH_FORBIDDEN');
    if (id) {
      const old = await tx.course.findUnique({ where: { id }, select: { departmentId: true } });
      if (!old || old.departmentId !== data.departmentId) throw codedNotFound('RESOURCE_NOT_FOUND');
    }
    const course = id
      ? await tx.course.update({ where: { id }, data })
      : await tx.course.create({ data });
    await recordAdminAction(tx, {
      actor,
      action: 'DICTIONARY_CHANGE',
      targetType: 'DICTIONARY_ENTRY',
      targetId: course.id,
      metadata: { kind: 'COURSE', change: id ? 'UPDATE' : 'CREATE' },
    });
    return { id: course.id };
  });
}

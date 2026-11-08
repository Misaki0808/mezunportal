import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { matchJobPosting } from '../rules/jobMatch';
import { addDays, istanbulDay } from '../rules/jobPosting';
import { stageNotification } from './notification-intent';

/** Yayınla aynı işlemde, yalnız doğrulanmış etkin öğrenciler için eşleşme ve günlük niyet. */
export async function stageJobMatches(tx: Prisma.TransactionClient, postingId: string, now: Date) {
  const posting = await tx.jobPosting.findUniqueOrThrow({
    where: { id: postingId },
    select: {
      targetGrades: true,
      targets: { select: { departmentId: true } },
      tags: { select: { tagId: true } },
    },
  });
  if (!posting.tags.length) return;
  const targetDepartmentIds = posting.targets.map((x) => x.departmentId);
  const tagIds = posting.tags.map((x) => x.tagId);
  const students = await tx.membership.findMany({
    where: {
      role: 'STUDENT',
      endedAt: null,
      verificationStatus: 'VERIFIED',
      departmentId: { in: targetDepartmentIds },
      user: {
        deletedAt: null,
        OR: [{ banned: false }, { banExpires: { lte: now } }],
        profile: { tags: { some: { tagId: { in: tagIds } } } },
      },
    },
    select: {
      userId: true,
      departmentId: true,
      entryYear: true,
      classOffset: true,
      user: { select: { profile: { select: { tags: { select: { tagId: true } } } } } },
    },
  });
  const recipients = new Set<string>();
  for (const student of students) {
    if (
      matchJobPosting(
        { targetDepartmentIds, tagIds, targetGrades: posting.targetGrades },
        { ...student, tagIds: student.user.profile?.tags.map((tag) => tag.tagId) ?? [] },
        now,
      ).matches
    )
      recipients.add(student.userId);
  }
  // Hesap silme de aynı kullanıcı satırını kilitler; silinen kullanıcıya işlem sonrasında
  // yeniden eşleşme yazılmasını önlemek için kilit altında durumu yeniden denetle.
  for (const userId of [...recipients].sort()) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR SHARE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true, banned: true, banExpires: true },
    });
    if (!user || user.deletedAt || (user.banned && (!user.banExpires || user.banExpires > now)))
      recipients.delete(userId);
  }
  if (!recipients.size) return;
  await tx.jobMatch.createMany({
    data: [...recipients].map((userId) => ({ postingId, userId, createdAt: now })),
    skipDuplicates: true,
  });
  const day = istanbulDay(now);
  const notBefore = new Date(`${addDays(day, 1)}T00:05:00+03:00`);
  for (const userId of recipients)
    await stageNotification(tx, userId, { type: 'jobMatch', event: 'digest', day }, notBefore);
}

/** Yalnız oturumdaki öğrencinin etkin üyeliklerinden kendi önerilerini üretir. */
export async function listSuggestedJobMatches(
  db: import('@/generated/prisma/client').PrismaClient,
  userId: string,
  now = new Date(),
) {
  const memberships = await db.membership.findMany({
    where: {
      userId,
      role: 'STUDENT',
      endedAt: null,
      verificationStatus: 'VERIFIED',
      user: { deletedAt: null },
    },
    select: { departmentId: true, entryYear: true, classOffset: true },
  });
  if (!memberships.length) return [];
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { tags: { select: { tagId: true } } },
  });
  const tagIds = profile?.tags.map((tag) => tag.tagId) ?? [];
  const today = new Date(`${istanbulDay(now)}T00:00:00Z`);
  const postings = await db.jobPosting.findMany({
    where: {
      status: 'PUBLISHED',
      deadlineOn: { gte: today },
      targets: { some: { departmentId: { in: memberships.map((m) => m.departmentId) } } },
      OR: [{ tags: { none: {} } }, { tags: { some: { tagId: { in: tagIds } } } }],
    },
    select: {
      id: true,
      title: true,
      organizationName: true,
      targetGrades: true,
      targets: { select: { departmentId: true } },
      tags: { select: { tagId: true } },
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
  });
  return postings
    .filter((posting) =>
      memberships.some(
        (member) =>
          matchJobPosting(
            {
              targetDepartmentIds: posting.targets.map((x) => x.departmentId),
              tagIds: posting.tags.map((x) => x.tagId),
              targetGrades: posting.targetGrades,
            },
            { ...member, tagIds },
            now,
          ).dashboardEligible,
      ),
    )
    .slice(0, 3)
    .map((posting) => ({
      id: posting.id,
      title: posting.title ?? '',
      organizationName: posting.organizationName ?? '',
    }));
}

/** Görünür kartlar için yalnız oturum sahibinin ortak etiketlerini döndürür. */
export async function sharedJobMatchTags(
  db: import('@/generated/prisma/client').PrismaClient,
  userId: string,
  postingIds: string[],
  now: Date,
) {
  if (!postingIds.length) return new Map<string, { slug: string; label: string | null }[]>();
  const [memberships, profile, postings] = await Promise.all([
    db.membership.findMany({
      where: { userId, role: 'STUDENT', endedAt: null, verificationStatus: 'VERIFIED' },
      select: { departmentId: true, entryYear: true, classOffset: true },
    }),
    db.profile.findUnique({ where: { userId }, select: { tags: { select: { tagId: true } } } }),
    db.jobPosting.findMany({
      where: { id: { in: postingIds } },
      select: {
        id: true,
        targetGrades: true,
        targets: { select: { departmentId: true } },
        tags: { select: { tagId: true, tag: { select: { slug: true, label: true } } } },
      },
    }),
  ]);
  const tags = profile?.tags.map((tag) => tag.tagId) ?? [];
  const results = new Map<string, { slug: string; label: string | null }[]>();
  for (const posting of postings) {
    const match = memberships
      .map((m) =>
        matchJobPosting(
          {
            targetDepartmentIds: posting.targets.map((x) => x.departmentId),
            targetGrades: posting.targetGrades,
            tagIds: posting.tags.map((x) => x.tagId),
          },
          { ...m, tagIds: tags },
          now,
        ),
      )
      .find((m) => m.matches);
    if (match)
      results.set(
        posting.id,
        posting.tags.filter((x) => match.sharedTagIds.includes(x.tagId)).map((x) => x.tag),
      );
  }
  return results;
}

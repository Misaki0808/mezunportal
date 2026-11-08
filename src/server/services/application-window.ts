import 'server-only';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import {
  applicationCalendarSchema,
  applicationFollowSchema,
  applicationScopeSchema,
  type ApplicationScope,
} from '@/contracts/application-window';
import { codedForbidden, codedNotFound } from '@/lib/errors';
import { createPermissions, type Actor } from '../permissions';
import { applicationDistribution } from '../rules/application-window';
import { notSuspended } from './mentor-directory';
import { requireConsent } from './privacy';
import { viewerUniversityIds } from './search';

type Tx = Prisma.TransactionClient;
function isStudent(actor: Actor) {
  return actor.facts.memberships.some(
    (m) => m.role === 'STUDENT' && m.endedAt === null && m.verificationStatus === 'VERIFIED',
  );
}
async function inScope(
  tx: Tx,
  userId: string,
  now: Date,
  run: (tx: Tx, actor: Actor, universities: string[]) => Promise<unknown>,
) {
  return tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`.then(async () => {
    const actor = await createPermissions({
      db: () => tx,
      getSessionUserId: async () => userId,
      now: () => now,
    }).requireVerifiedMember();
    await requireConsent(tx, userId);
    return run(tx, actor, await viewerUniversityIds(tx, actor));
  });
}
export async function aggregateApplicationMonths(
  tx: Tx,
  universities: string[],
  scope: ApplicationScope,
  now: Date,
) {
  const parsed = applicationScopeSchema.parse(scope);
  const companies =
    parsed.kind === 'COMPANY'
      ? await tx.company.findMany({ where: { id: parsed.id }, select: { id: true } })
      : await tx.company.findMany({ where: { sectorId: parsed.id }, select: { id: true } });
  const companyIds = companies.map((company) => company.id);
  const where: Prisma.ExperienceWhereInput = {
    companyId: { in: companyIds },
    type: 'INTERNSHIP',
    status: 'PUBLISHED',
    department: { faculty: { universityId: { in: universities } } },
  };
  // P2-09: aynı kapsamda herhangi bir anonim deneyim varken kesişen kesitler verilmez.
  if (await tx.experience.count({ where: { ...where, isAnonymous: true } })) return [];
  const rows = await tx.experience.findMany({
    where: { ...where, author: { is: { deletedAt: null, ...notSuspended(now) } } },
    select: { authorId: true, appliedMonth: true, termSeason: true },
  });
  return applicationDistribution(
    rows.flatMap((row) => (row.authorId ? [{ ...row, authorId: row.authorId }] : [])),
  );
}
export async function getApplicationCalendar(
  db: PrismaClient,
  userId: string,
  scope: ApplicationScope,
  now = new Date(),
) {
  return db.$transaction(
    async (tx) =>
      inScope(tx, userId, now, async (tx, actor, universities) => {
        const parsed = applicationScopeSchema.parse(scope);
        const exists =
          parsed.kind === 'COMPANY'
            ? await tx.company.count({ where: { id: parsed.id } })
            : await tx.sector.count({ where: { id: parsed.id } });
        if (!exists) throw codedNotFound('RESOURCE_NOT_FOUND');
        const [months, follow] = await Promise.all([
          aggregateApplicationMonths(tx, universities, parsed, now),
          tx.companyFollow.findFirst({
            where: {
              userId,
              ...(parsed.kind === 'COMPANY' ? { companyId: parsed.id } : { sectorId: parsed.id }),
            },
            select: { id: true },
          }),
        ]);
        return applicationCalendarSchema.parse({
          months,
          isFollowing: !!follow,
          canFollow: isStudent(actor),
        });
      }),
    { timeout: 20000 },
  );
}
export async function setApplicationFollow(
  db: PrismaClient,
  userId: string,
  input: unknown,
  now = new Date(),
) {
  return db.$transaction(
    async (tx) =>
      inScope(tx, userId, now, async (tx, actor) => {
        if (!isStudent(actor)) throw codedForbidden('AUTH_FORBIDDEN');
        const { scope, following } = applicationFollowSchema.parse(input);
        const exists =
          scope.kind === 'COMPANY'
            ? await tx.company.count({ where: { id: scope.id } })
            : await tx.sector.count({ where: { id: scope.id } });
        if (!exists) throw codedNotFound('RESOURCE_NOT_FOUND');
        const target = scope.kind === 'COMPANY' ? { companyId: scope.id } : { sectorId: scope.id };
        if (following)
          await tx.companyFollow.createMany({
            data: [{ userId, ...target }],
            skipDuplicates: true,
          });
        else await tx.companyFollow.deleteMany({ where: { userId, ...target } });
        return { following };
      }),
    { timeout: 20000 },
  );
}

/** Kuyruk ve teslim öncesi aynı güncel yetki, takip, tercih ve k eşiği yeniden kontrol edilir. */
export async function hasCurrentApplicationWindow(
  db: PrismaClient,
  userId: string,
  cycle: string,
  now = new Date(),
): Promise<boolean> {
  const { applicationWindowCycle } = await import('../rules/application-window');
  if (applicationWindowCycle(now) !== cycle) return false;
  try {
    return await db.$transaction(
      async (tx) => {
        const actor = await createPermissions({
          db: () => tx,
          getSessionUserId: async () => userId,
          now: () => now,
        }).requireVerifiedMember({ roles: ['STUDENT'] });
        await requireConsent(tx, userId);
        const preference = await tx.notificationPreference.findUnique({
          where: { userId_type: { userId, type: 'APPLICATION_WINDOW' } },
          select: { enabled: true },
        });
        if (preference?.enabled === false) return false;
        const follows = await tx.companyFollow.findMany({
          where: { userId },
          select: { companyId: true, sectorId: true },
        });
        const universities = await viewerUniversityIds(tx, actor);
        const month = Number(cycle.slice(5));
        for (const follow of follows) {
          const scope: ApplicationScope | null = follow.companyId
            ? { kind: 'COMPANY', id: follow.companyId }
            : follow.sectorId
              ? { kind: 'SECTOR', id: follow.sectorId }
              : null;
          if (
            scope &&
            (await aggregateApplicationMonths(tx, universities, scope, now)).some(
              (entry) => entry.month === month,
            )
          )
            return true;
        }
        return false;
      },
      { timeout: 20000 },
    );
  } catch (error) {
    const { isCodedError } = await import('@/lib/errors');
    if (
      isCodedError(error) &&
      [
        'AUTH_UNAUTHENTICATED',
        'AUTH_ACCOUNT_SUSPENDED',
        'AUTH_NOT_VERIFIED',
        'AUTH_FORBIDDEN',
        'CONSENT_REQUIRED',
      ].includes(error.code)
    )
      return false;
    throw error;
  }
}

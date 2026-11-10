import 'server-only';
import messages from '../../../messages/tr.json';
import type { PrismaClient } from '@/generated/prisma/client';
import { createPermissions } from '../permissions/guards';
import { selectDigest } from '../rules/digest';
import { istanbulDay } from '../rules/jobPosting';
import { aggregateApplicationMonths } from './application-window';
import { listMyJobMatchNotifications, sharedJobMatchTags } from './job-match';
import { requireConsent } from './privacy';
import { viewerUniversityIds } from './search';

/** Görünürlük her çağrıda güncel oturum sahibinden türetilir; başka kullanıcı seçimi yoktur. */
export async function buildMonthlyDigest(db: PrismaClient, userId: string, now = new Date()) {
  const currentMonth = istanbulDay(now).slice(0, 7);
  const [year, month] = currentMonth.split('-').map(Number) as [number, number];
  const prior = new Date(Date.UTC(year, month - 2, 1));
  const previousMonth = `${prior.getUTCFullYear()}-${String(prior.getUTCMonth() + 1).padStart(2, '0')}`;
  const from = new Date(`${previousMonth}-01T00:00:00+03:00`);
  const to = new Date(`${currentMonth}-01T00:00:00+03:00`);
  const scoped = await db.$transaction(async (tx) => {
    const actor = await createPermissions({
      db: () => tx,
      getSessionUserId: async () => userId,
      now: () => now,
    }).requireVerifiedMember();
    await requireConsent(tx, userId);
    const departments = actor.facts.memberships
      .filter((m) => m.endedAt === null && m.verificationStatus === 'VERIFIED')
      .map((m) => m.departmentId);
    const [experiences, points, follows, universities, preferences, events] = await Promise.all([
      tx.experience.findMany({
        where: {
          departmentIdAtWrite: { in: departments },
          status: 'PUBLISHED',
          publishedAt: { gte: from, lt: to },
        },
        select: { id: true, type: true },
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        take: 5,
      }),
      tx.pointEntry.groupBy({
        by: ['status'],
        where: { userId, status: { in: ['PENDING', 'FINAL'] } },
        _sum: { points: true },
      }),
      tx.companyFollow.findMany({
        where: { userId },
        select: {
          companyId: true,
          sectorId: true,
          company: { select: { name: true } },
          sector: { select: { name: true } },
        },
        orderBy: { id: 'asc' },
      }),
      viewerUniversityIds(tx, actor),
      tx.notificationPreference.findMany({
        where: { userId, type: { in: ['JOB_MATCH', 'APPLICATION_WINDOW'] } },
        select: { type: true, enabled: true },
      }),
      tx.campusEvent.findMany({
        where: {
          status: 'PUBLISHED',
          startsAt: { gt: now },
          departments: { some: { departmentId: { in: departments } } },
        },
        select: { id: true, title: true },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 5,
      }),
    ]);
    const applicationWindows: { label: string }[] = [];
    for (const follow of preferences.some(
      (item) => item.type === 'APPLICATION_WINDOW' && !item.enabled,
    )
      ? []
      : follows) {
      const scope = follow.companyId
        ? ({ kind: 'COMPANY', id: follow.companyId } as const)
        : follow.sectorId
          ? ({ kind: 'SECTOR', id: follow.sectorId } as const)
          : null;
      const label = follow.company?.name ?? follow.sector?.name;
      if (
        scope &&
        label &&
        (await aggregateApplicationMonths(tx, universities, scope, now)).some(
          (entry) => entry.month === month,
        )
      )
        applicationWindows.push({ label });
    }
    const sum = (status: 'FINAL' | 'PENDING') =>
      points.find((entry) => entry.status === status)?._sum.points ?? 0;
    return {
      experiences: experiences.map(({ id, type }) => ({
        id,
        label: messages.experiences.types[type],
      })),
      contribution: { earned: sum('FINAL'), pending: sum('PENDING') },
      applicationWindows,
      events: events.map(({ id, title }) => ({ id, label: title })),
      jobsEnabled: !preferences.some((item) => item.type === 'JOB_MATCH' && !item.enabled),
    };
  });
  const suggestions = await listMyJobMatchNotifications(db, userId, now);
  const matchingTags = await sharedJobMatchTags(
    db,
    userId,
    suggestions.map(({ id }) => id),
    now,
  );
  return selectDigest({
    experiences: scoped.experiences,
    contribution: scoped.contribution,
    applicationWindows: scoped.applicationWindows,
    jobs: suggestions
      .filter(({ id }) => scoped.jobsEnabled && matchingTags.has(id))
      .slice(0, 3)
      .map(({ id, title, organizationName }) => ({ id, title, organization: organizationName })),
    events: scoped.events,
  });
}

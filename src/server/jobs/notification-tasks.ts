import 'server-only';
import { notificationCopy as t } from './notification-copy';
import { getAuthEnv, getEnv } from '@/lib/env';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  academicYearStartOf,
  computeClassStanding,
  NORMAL_PROGRAM_YEARS,
} from '../rules/classYear';
import { enqueueEmail } from './email';
import { sendNotification } from '../services/notification-email';
import { stillThereToken } from '../services/still-there';

const DAY = 24 * 60 * 60 * 1000;
function beforeMonths(now: Date, months: number) {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

/** Her sayfa için sabit anahtar; iş tekrarı aynı e-postayı kuyruğa yazmaz. */
export async function profileFreshness(db: PrismaClient, now = new Date()) {
  const before = beforeMonths(now, 6);
  let after = '';
  for (;;) {
    const rows = await db.profile.findMany({
      where: {
        id: { gt: after },
        updatedAt: { lte: before },
        OR: [{ lastFreshnessPromptAt: null }, { lastFreshnessPromptAt: { lte: before } }],
        user: { deletedAt: null },
      },
      orderBy: { id: 'asc' },
      take: 100,
      select: { id: true, userId: true, updatedAt: true, lastFreshnessPromptAt: true },
    });
    if (!rows.length) break;
    for (const row of rows) {
      const anchor = row.lastFreshnessPromptAt ?? row.updatedAt;
      const sent = await sendNotification({
        userId: row.userId,
        event: 'freshness',
        eventId: `${row.id}:${anchor.toISOString()}`,
        path: '/hesap',
      });
      if (sent)
        await db.profile.updateMany({
          where: { id: row.id, updatedAt: row.updatedAt },
          data: { lastFreshnessPromptAt: now },
        });
    }
    after = rows[rows.length - 1]!.id;
  }
}

/** Mezuniyet dönemi, var olan sınıf hesabındaki dördüncü yıl olarak yorumlanır. */
export async function studentEmailMigration(db: PrismaClient, now = new Date()) {
  let after = '';
  for (;;) {
    const rows = await db.membership.findMany({
      where: {
        id: { gt: after },
        role: 'STUDENT',
        endedAt: null,
        verificationStatus: 'VERIFIED',
        user: { deletedAt: null },
      },
      orderBy: { id: 'asc' },
      take: 100,
      select: {
        id: true,
        userId: true,
        entryYear: true,
        classOffset: true,
        user: { select: { email: true } },
        department: {
          select: {
            faculty: { select: { university: { select: { studentEmailDomains: true } } } },
          },
        },
      },
    });
    if (!rows.length) break;
    for (const row of rows) {
      const standing = computeClassStanding(row, now);
      if (
        standing.kind !== 'GRADE' ||
        standing.grade !== NORMAL_PROGRAM_YEARS ||
        !row.department.faculty.university.studentEmailDomains.some((domain) =>
          row.user.email.toLowerCase().endsWith(`@${domain.toLowerCase()}`),
        )
      )
        continue;
      const cycle = `${academicYearStartOf(now)}`;
      await sendNotification({
        userId: row.userId,
        event: 'migration',
        eventId: `${row.id}:${cycle}`,
        path: '/hesap/e-posta',
      });
    }
    after = rows[rows.length - 1]!.id;
  }
}

export async function alumniStillThere(db: PrismaClient, now = new Date()) {
  let after = '';
  const cycle = String(now.getUTCFullYear());
  for (;;) {
    const positions = await db.position.findMany({
      where: {
        id: { gt: after },
        isCurrent: true,
        user: {
          deletedAt: null,
          memberships: { some: { role: 'ALUMNI', endedAt: null, verificationStatus: 'VERIFIED' } },
        },
      },
      orderBy: { id: 'asc' },
      take: 100,
      select: { id: true, userId: true, companyRaw: true, user: { select: { email: true } } },
    });
    if (!positions.length) break;
    // Her pozisyon için ayrı sorgu yerine bir sayfadaki mevcut/en son kayıtları topluca al.
    const existing = await db.notificationAction.findMany({
      where: { positionId: { in: positions.map((position) => position.id) } },
      orderBy: { createdAt: 'desc' },
    });
    const latestByPosition = new Map<string, (typeof existing)[number]>();
    const cycleByPosition = new Map<string, (typeof existing)[number]>();
    for (const action of existing) {
      if (!latestByPosition.has(action.positionId)) latestByPosition.set(action.positionId, action);
      if (action.cycle === cycle) cycleByPosition.set(action.positionId, action);
    }
    const toCreate = positions.filter((position) => {
      if (cycleByPosition.has(position.id)) return false;
      const latest = latestByPosition.get(position.id);
      return !latest || latest.createdAt <= new Date(now.getTime() - 365 * DAY);
    });
    if (toCreate.length) {
      await db.notificationAction.createMany({
        data: toCreate.map((position) => ({
          userId: position.userId,
          positionId: position.id,
          cycle,
          expiresAt: new Date(now.getTime() + 30 * DAY),
        })),
        skipDuplicates: true,
      });
      const created = await db.notificationAction.findMany({
        where: { positionId: { in: toCreate.map((position) => position.id) }, cycle },
      });
      for (const action of created) cycleByPosition.set(action.positionId, action);
    }
    for (const position of positions) {
      const action = cycleByPosition.get(position.id);
      if (!action) continue;
      if (action.usedAt || action.expiresAt <= now) continue;
      const link = (choice: 'YES' | 'NO') => {
        const url = new URL('/bildirim-yanit', getEnv().APP_URL);
        url.hash = new URLSearchParams({
          token: stillThereToken(action!.id, choice, getAuthEnv().BETTER_AUTH_SECRET),
          choice,
        }).toString();
        return url.href;
      };
      await enqueueEmail({
        to: position.user.email,
        recipientUserId: position.userId,
        template: 'alumni.still-there',
        idempotencyKey: `alumni.still-there:${action.id}`,
        subject: t('stillThereSubject'),
        text: t('stillThereText', {
          company: position.companyRaw,
          yesUrl: link('YES'),
          noUrl: link('NO'),
        }),
      });
    }
    after = positions[positions.length - 1]!.id;
  }
}

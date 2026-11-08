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
    for (const position of positions) {
      let action = await db.notificationAction.findUnique({
        where: {
          userId_positionId_cycle: { userId: position.userId, positionId: position.id, cycle },
        },
      });
      if (!action) {
        const latest = await db.notificationAction.findFirst({
          where: { userId: position.userId, positionId: position.id },
          orderBy: { createdAt: 'desc' },
        });
        if (latest && latest.createdAt > new Date(now.getTime() - 365 * DAY)) continue;
        action = await db.notificationAction.upsert({
          where: {
            userId_positionId_cycle: { userId: position.userId, positionId: position.id, cycle },
          },
          create: {
            userId: position.userId,
            positionId: position.id,
            cycle,
            expiresAt: new Date(now.getTime() + 30 * DAY),
          },
          update: {},
        });
      }
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

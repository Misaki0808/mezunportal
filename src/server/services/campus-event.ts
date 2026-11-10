import 'server-only';
import { createHmac } from 'node:crypto';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  campusEventIdSchema,
  cancelCampusEventSchema,
  checkInCampusEventSchema,
  createCampusEventSchema,
  reviewCampusEventSchema,
} from '@/contracts/campus-events';
import { codedConflict, codedForbidden, codedNotFound, isCodedError } from '@/lib/errors';
import { createPermissions } from '../permissions/guards';
import {
  campusEventCode,
  eventAttendanceMultiplier,
  validCampusEventCode,
} from '../rules/campus-event';
import { monthRange } from '../rules/appointmentSlots';
import { covers, loadAnyAdmin, TX_OPTIONS } from './admin-access';
import { requireConsent } from './privacy';
import { awardPoint } from './points';
import { campusEventQr } from './campus-event-qr';
import { recordAdminAction } from './audit';
import { consumeRateLimit } from './rateLimit';

type Tx = Prisma.TransactionClient;
type Deps = { db: PrismaClient; now?: () => Date };
const nowOf = (deps: Deps) => deps.now?.() ?? new Date();
const checkinLimit = { name: 'campus-event-code', limit: 5, windowMs: 60_000 } as const;

/** Ağ özetleri inceleme penceresinden sonra temizlenir; IP hiçbir zaman saklanmaz. */
export async function purgeCampusEventNetworks(db: PrismaClient, now = new Date()) {
  return db.eventAttendance.updateMany({
    where: {
      attendedAt: { lt: new Date(now.getTime() - 30 * 86400_000) },
      networkDigest: { not: null },
    },
    data: { networkDigest: null },
  });
}

async function member(tx: Tx, userId: string, now: Date) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR SHARE`;
  const actor = await createPermissions({
    db: () => tx,
    getSessionUserId: async () => userId,
    now: () => now,
  }).requireVerifiedMember();
  await requireConsent(tx, userId);
  return actor;
}
function memberDepartments(actor: Awaited<ReturnType<typeof member>>) {
  return actor.facts.memberships
    .filter((m) => m.endedAt === null && m.verificationStatus === 'VERIFIED')
    .map((m) => m.departmentId);
}
async function adminFor(tx: Tx, userId: string, departments: string[], now: Date) {
  const actor = await loadAnyAdmin(tx, userId, now);
  if (!departments.length) throw codedForbidden('AUTH_FORBIDDEN');
  for (const department of departments)
    if (!(await covers(tx, actor, department))) throw codedForbidden('AUTH_FORBIDDEN');
}

export async function createCampusEvent(deps: Deps, userId: string, input: unknown) {
  const data = createCampusEventSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await adminFor(tx, userId, data.departmentIds, now);
    if (new Date(data.startsAt) <= now) throw codedConflict('VALIDATION_INVALID');
    const event = await tx.campusEvent.create({
      data: {
        title: data.title,
        description: data.description,
        location: data.location,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        capacity: data.capacity,
        createdById: userId,
        departments: { create: data.departmentIds.map((departmentId) => ({ departmentId })) },
      },
      select: { id: true },
    });
    await recordAdminAction(tx, {
      actor: { userId },
      action: 'CAMPUS_EVENT_CREATE',
      targetType: 'CAMPUS_EVENT',
      targetId: event.id,
    });
    return event;
  }, TX_OPTIONS);
}

export async function reviewCampusEvent(deps: Deps, userId: string, input: unknown) {
  const data = reviewCampusEventSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadAnyAdmin(tx, userId, now);
    await tx.$queryRaw`SELECT "id" FROM "CampusEvent" WHERE "id"=${data.eventId} FOR UPDATE`;
    const event = await tx.campusEvent.findUnique({
      where: { id: data.eventId },
      include: { departments: true },
    });
    if (!event) throw codedNotFound('RESOURCE_NOT_FOUND');
    for (const { departmentId } of event.departments)
      if (!(await covers(tx, actor, departmentId))) throw codedForbidden('AUTH_FORBIDDEN');
    if (event.status !== 'PENDING') throw codedConflict('VALIDATION_INVALID');
    await recordAdminAction(tx, {
      actor,
      action: data.decision === 'PUBLISH' ? 'CAMPUS_EVENT_PUBLISH' : 'CAMPUS_EVENT_REJECT',
      targetType: 'CAMPUS_EVENT',
      targetId: event.id,
      reason: data.reason,
    });
    return tx.campusEvent.update({
      where: { id: event.id },
      data: {
        status: data.decision === 'PUBLISH' ? 'PUBLISHED' : 'REJECTED',
        reviewedById: userId,
        reviewedAt: now,
        reviewReason: data.reason,
      },
      select: { id: true, status: true },
    });
  }, TX_OPTIONS);
}

export async function cancelCampusEvent(deps: Deps, userId: string, input: unknown) {
  const data = cancelCampusEventSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadAnyAdmin(tx, userId, now);
    await tx.$queryRaw`SELECT "id" FROM "CampusEvent" WHERE "id"=${data.eventId} FOR UPDATE`;
    const event = await tx.campusEvent.findUnique({
      where: { id: data.eventId },
      include: { departments: true },
    });
    if (!event) throw codedNotFound('RESOURCE_NOT_FOUND');
    for (const { departmentId } of event.departments)
      if (!(await covers(tx, actor, departmentId))) throw codedForbidden('AUTH_FORBIDDEN');
    if (event.status !== 'PUBLISHED') throw codedConflict('VALIDATION_INVALID');
    await recordAdminAction(tx, {
      actor,
      action: 'CAMPUS_EVENT_CANCEL',
      targetType: 'CAMPUS_EVENT',
      targetId: event.id,
      reason: data.reason,
    });
    await tx.pointEntry.updateMany({
      where: {
        action: 'EVENT_ATTENDED',
        sourceType: 'CAMPUS_EVENT',
        sourceId: event.id,
        status: { in: ['PENDING', 'FINAL'] },
      },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revokedById: userId,
        revokedReason: 'EVENT_CANCELLED',
      },
    });
    return tx.campusEvent.update({
      where: { id: event.id },
      data: {
        status: 'CANCELLED',
        reviewedById: userId,
        reviewedAt: now,
        reviewReason: data.reason,
      },
      select: { id: true, status: true },
    });
  }, TX_OPTIONS);
}

export async function listCampusEvents(deps: Deps, userId: string) {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await member(tx, userId, now);
    return tx.campusEvent
      .findMany({
        where: {
          status: 'PUBLISHED',
          endsAt: { gt: now },
          departments: { some: { departmentId: { in: memberDepartments(actor) } } },
        },
        select: {
          id: true,
          title: true,
          description: true,
          location: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          registrations: { where: { userId }, select: { userId: true } },
          attendances: { where: { userId }, select: { id: true } },
          _count: { select: { registrations: true } },
        },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 100,
      })
      .then((events) =>
        events.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          location: e.location,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          capacity: e.capacity,
          registeredCount: e._count.registrations,
          registered: !!e.registrations.length,
          attended: !!e.attendances.length,
        })),
      );
  }, TX_OPTIONS);
}

export async function listCampusEventModeration(deps: Deps, userId: string) {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadAnyAdmin(tx, userId, now);
    const permissions = createPermissions({
      db: () => tx,
      getSessionUserId: async () => userId,
      now: () => now,
    });
    const departments = await permissions.managedDepartmentIds(actor);
    return tx.campusEvent.findMany({
      where: {
        departments: {
          some: { departmentId: { in: departments } },
          every: { departmentId: { in: departments } },
        },
      },
      select: { id: true, title: true, startsAt: true, endsAt: true, status: true },
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      take: 100,
    });
  }, TX_OPTIONS);
}

export async function registerCampusEvent(deps: Deps, userId: string, input: unknown) {
  const { eventId } = campusEventIdSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await member(tx, userId, now);
    await tx.$queryRaw`SELECT "id" FROM "CampusEvent" WHERE "id"=${eventId} FOR UPDATE`;
    const event = await tx.campusEvent.findFirst({
      where: {
        id: eventId,
        status: 'PUBLISHED',
        endsAt: { gt: now },
        departments: { some: { departmentId: { in: memberDepartments(actor) } } },
      },
      select: { capacity: true },
    });
    if (!event) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (
      await tx.campusEventRegistration.findUnique({
        where: { eventId_userId: { eventId, userId } },
      })
    )
      return { registered: true };
    if ((await tx.campusEventRegistration.count({ where: { eventId } })) >= event.capacity)
      throw codedConflict('CAMPUS_EVENT_CAPACITY_FULL');
    await tx.campusEventRegistration.create({ data: { eventId, userId } });
    return { registered: true };
  }, TX_OPTIONS);
}

export async function getCampusEventCode(
  deps: Deps,
  userId: string,
  input: unknown,
  secret: string,
  appUrl: string,
) {
  const { eventId } = campusEventIdSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadAnyAdmin(tx, userId, now);
    const event = await tx.campusEvent.findUnique({
      where: { id: eventId },
      include: { departments: true, _count: { select: { attendances: true } } },
    });
    if (!event) throw codedNotFound('RESOURCE_NOT_FOUND');
    for (const { departmentId } of event.departments)
      if (!(await covers(tx, actor, departmentId))) throw codedForbidden('AUTH_FORBIDDEN');
    if (event.status !== 'PUBLISHED' || now < event.startsAt || now >= event.endsAt)
      throw codedNotFound('RESOURCE_NOT_FOUND');
    const code = campusEventCode(eventId, secret, now);
    return {
      ...code,
      qrSvg: campusEventQr(eventId, code.code, appUrl),
      expiresAt: new Date(Math.min(code.expiresAt.getTime(), event.endsAt.getTime())),
      attendanceCount: event._count.attendances,
    };
  }, TX_OPTIONS);
}

export async function checkInCampusEvent(
  deps: Deps,
  userId: string,
  input: unknown,
  secret: string,
  clientIp: string | null,
) {
  const data = checkInCampusEventSchema.safeParse(input),
    now = nowOf(deps);
  try {
    await consumeRateLimit(deps.db, checkinLimit, userId, now);
  } catch (error) {
    if (isCodedError(error) && error.code === 'RATE_LIMITED') return { accepted: false };
    throw error;
  }
  if (!data.success) return { accepted: false };
  return deps.db.$transaction(async (tx) => {
    const actor = await member(tx, userId, now);
    const { eventId, code } = data.data;
    await tx.$queryRaw`SELECT "id" FROM "CampusEvent" WHERE "id"=${eventId} FOR UPDATE`;
    const event = await tx.campusEvent.findFirst({
      where: {
        id: eventId,
        status: 'PUBLISHED',
        departments: { some: { departmentId: { in: memberDepartments(actor) } } },
        registrations: { some: { userId } },
      },
    });
    if (
      !event ||
      !validCampusEventCode({
        eventId,
        code,
        secret,
        now,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      })
    )
      return { accepted: false };
    if (await tx.eventAttendance.findUnique({ where: { eventId_userId: { eventId, userId } } }))
      return { accepted: true };
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`points:event:${userId}`}, 0))::text`;
    const range = monthRange(now);
    const count = await tx.pointEntry.count({
      where: {
        userId,
        action: 'EVENT_ATTENDED',
        status: { not: 'REVOKED' },
        multiplierPercent: { gt: 0 },
        eventAt: { gte: range.from, lt: range.to },
      },
    });
    await tx.eventAttendance.create({
      data: {
        eventId,
        userId,
        attendedAt: now,
        networkDigest: clientIp
          ? createHmac('sha256', secret)
              .update(`campus-network:v1:${eventId}:${clientIp}`)
              .digest('hex')
          : null,
      },
    });
    await awardPoint(
      tx,
      {
        userId,
        action: 'EVENT_ATTENDED',
        sourceType: 'CAMPUS_EVENT',
        sourceId: eventId,
        eventAt: now,
        multiplierPercent: eventAttendanceMultiplier(count),
      },
      now,
    );
    await flagCampusEventPatterns(tx, eventId);
    return { accepted: true };
  }, TX_OPTIONS);
}

/** İşaret cezalandırmaz; aynı saniye/ağ eşiğinde ilgili puanlar insan incelemesine kalır. */
async function flagCampusEventPatterns(tx: Tx, eventId: string) {
  const attendees = await tx.eventAttendance.findMany({
    where: { eventId },
    select: { userId: true, attendedAt: true, networkDigest: true },
  });
  const groups = new Map<
    string,
    { rule: 'EVENT_BURST' | 'EVENT_NETWORK'; users: string[]; from: Date; to: Date }
  >();
  for (const row of attendees) {
    const keys = [
      `EVENT_BURST:${Math.floor(row.attendedAt.getTime() / 1000)}`,
      ...(row.networkDigest ? [`EVENT_NETWORK:${row.networkDigest}`] : []),
    ];
    for (const key of keys) {
      const group = groups.get(key) ?? {
        rule: key.startsWith('EVENT_BURST:') ? 'EVENT_BURST' : 'EVENT_NETWORK',
        users: [],
        from: row.attendedAt,
        to: row.attendedAt,
      };
      group.users.push(row.userId);
      if (row.attendedAt < group.from) group.from = row.attendedAt;
      if (row.attendedAt > group.to) group.to = row.attendedAt;
      groups.set(key, group);
    }
  }
  let flagged = 0;
  for (const [key, group] of groups) {
    if (group.users.length < 3) continue;
    const entries = await tx.pointEntry.findMany({
      where: {
        action: 'EVENT_ATTENDED',
        sourceType: 'CAMPUS_EVENT',
        sourceId: eventId,
        userId: { in: group.users },
        status: { not: 'REVOKED' },
      },
      select: { id: true, userId: true, points: true },
    });
    const evidenceKey = createHmac('sha256', eventId).update(key).digest('hex');
    const { count } = await tx.suspicionFlag.createMany({
      data: entries.map((entry) => ({
        userId: entry.userId,
        rule: group.rule,
        evidenceKey,
        entryIds: [entry.id],
        windowStart: group.from,
        windowEnd: group.to,
        entryCount: group.users.length,
        points: entry.points,
      })),
      skipDuplicates: true,
    });
    flagged += count;
  }
  return flagged;
}

/** İlk işaret karara bağlanınca kalan bekleyen etkinlik kanıtını yeniden değerlendirir. */
export async function scanCampusEventPatterns(db: PrismaClient, now = new Date()) {
  let after = '',
    flagged = 0;
  for (;;) {
    const events = await db.pointEntry.findMany({
      where: {
        action: 'EVENT_ATTENDED',
        sourceType: 'CAMPUS_EVENT',
        status: 'PENDING',
        eventAt: { lte: now },
        sourceId: { gt: after },
      },
      distinct: ['sourceId'],
      select: { sourceId: true },
      orderBy: { sourceId: 'asc' },
      take: 100,
    });
    if (!events.length) return flagged;
    for (const { sourceId } of events) {
      flagged += await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "CampusEvent" WHERE "id"=${sourceId} FOR UPDATE`;
        return flagCampusEventPatterns(tx, sourceId);
      }, TX_OPTIONS);
    }
    after = events[events.length - 1]!.sourceId;
  }
}

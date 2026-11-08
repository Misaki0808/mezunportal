import 'server-only';

import {
  APPOINTMENT_REQUEST_RATE_LIMIT,
  SLOT_HORIZON_DAYS,
  appointmentIdSchema,
  appointmentPageSchema,
  appointmentViewSchema,
  cancelAppointmentSchema,
  listMyAppointmentsSchema,
  listSlotsSchema,
  mentorSettingsViewSchema,
  requestAppointmentSchema,
  respondAppointmentSchema,
  saveAvailabilitySchema,
  saveMentorSettingsSchema,
  setMeetLinkSchema,
  setPauseSchema,
  slotListSchema,
  type AppointmentPage,
  type AppointmentView,
  type CancelAppointmentInput,
  type ListMyAppointmentsInput,
  type ListSlotsInput,
  type MentorSettingsView,
  type RequestAppointmentInput,
  type RespondAppointmentInput,
  type SaveAvailabilityInput,
  type SaveMentorSettingsInput,
  type SetMeetLinkInput,
  type SetPauseInput,
  type SlotList,
  type AppointmentIdInput,
} from '@/contracts/appointment';
import type { MeetingModeName } from '@/contracts/mentor-directory';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { codedConflict, codedForbidden, codedNotFound, codedValidation } from '@/lib/errors';

import type { CalendarPort } from '../external/calendar/types';
import { loadActor, type Actor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import {
  canTransition,
  computeExpiresAt,
  hasCapacity,
  isCancellable,
  isExpired,
  needsImmediateReminder,
} from '../rules/appointmentLifecycle';
import { findSlot, generateSlots, monthKey, monthRange } from '../rules/appointmentSlots';
import { evaluateAccess } from '../rules/authorization';
import { buildIcs } from '../rules/ics';
import type { AppointmentNotice, AppointmentNotifier } from './appointment-notifier';
import { viewerUniversityIds } from './search';
import { CAPACITY_STATUSES } from './mentor-load';
import { onboardingSnapshot } from './profile';
import { consumeRateLimit } from './rateLimit';
import { visibleMentorWhere } from './mentor-directory';

/**
 * Randevu motoru (P1-10). Kimlik yalnız `userId`'dir (oturumdan); yetki işlemin içinde güncel veriyle yeniden yüklenir.
 * Durum değişikliği ve kapasite/çakışma denetimi TEK işlemdedir; çakışmanın son sözü veritabanı exclusion
 * constraint'idir. Bildirimler commit'ten SONRA en iyi gayretle gider. Takvim çağrısı istek içinde değil `appointment-jobs`
 * süpürmesinde yapılır (dış servis çökse de onay bozulmaz).
 */
export type AppointmentDeps = {
  db: PrismaClient;
  now?: () => Date;
  /** Kapalıysa `null`: online randevu yine onaylanır, mentor linki elle ekler. */
  calendar: CalendarPort | null;
  notifier: AppointmentNotifier;
};
export type Tx = Prisma.TransactionClient;
const TX = { timeout: 20_000, maxWait: 10_000 } as const;
export const nowOf = (deps: Pick<AppointmentDeps, 'now'>) => (deps.now ?? (() => new Date()))();
const DAY = 86_400_000;
const PAUSE_MAX_DAYS = 365;

// ---------------------------------------------------------------------------------------------
// Ortak yardımcılar
// ---------------------------------------------------------------------------------------------

async function requireMember(tx: Tx, userId: string, now: Date): Promise<Actor> {
  const actor = await loadActor(tx, userId, now);
  const access = evaluateAccess(actor?.facts ?? null, { action: 'directoryUse' });
  if (!access.allowed || !actor) {
    throw errorForDenyReason(access.allowed ? 'UNAUTHENTICATED' : access.reason);
  }
  return actor;
}

/** Postgres exclusion/unique ihlali Prisma'da kod taşımayabilir; kısıt adına bakılır. */
function constraintOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Error) {
    return `${(error as { code?: string }).code ?? ''} ${error.message}`;
  }
  return '';
}
const isOverlap = (error: unknown) => /no_overlap|23P01/.test(constraintOf(error));
const isOpenRequestConflict = (error: unknown) =>
  /Appointment_one_open_request/.test(constraintOf(error)) ||
  (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');

const appointmentSelect = {
  id: true,
  mentorId: true,
  menteeId: true,
  startsAt: true,
  endsAt: true,
  mode: true,
  menteeNote: true,
  location: true,
  status: true,
  expiresAt: true,
  decidedAt: true,
  decisionNote: true,
  meetUrl: true,
  calendarEventId: true,
  calendarFailedAt: true,
  cancelledById: true,
  cancelledBySystem: true,
  cancelReason: true,
  createdAt: true,
  mentor: { select: { id: true, name: true, email: true } },
  mentee: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AppointmentSelect;
export type AppointmentRow = Prisma.AppointmentGetPayload<{ select: typeof appointmentSelect }>;
export { appointmentSelect };

async function confirmedInMonth(tx: Tx, mentorId: string, date: Date): Promise<number> {
  const { from, to } = monthRange(date);
  return tx.appointment.count({
    where: { mentorId, status: { in: [...CAPACITY_STATUSES] }, startsAt: { gte: from, lt: to } },
  });
}

/** Önümüzdeki ufuktaki takvim aylarından kapasitesi dolmuş olanlar. */
async function fullMonthsOf(tx: Tx, mentorId: string, monthlyCapacity: number, now: Date) {
  const full = new Set<string>();
  const seen = new Set<string>();
  for (let day = 0; day <= SLOT_HORIZON_DAYS + 1; day += 7) {
    const date = new Date(now.getTime() + day * DAY);
    const key = monthKey(date);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!hasCapacity(await confirmedInMonth(tx, mentorId, date), monthlyCapacity)) full.add(key);
  }
  return full;
}

function nameOf(row: AppointmentRow, viewerId: string) {
  return row.mentorId === viewerId ? row.mentee : row.mentor;
}

function toView(
  row: AppointmentRow,
  viewerId: string,
  now: Date,
  fullMonths: ReadonlySet<string>,
): AppointmentView {
  const role = row.mentorId === viewerId ? ('MENTOR' as const) : ('MENTEE' as const);
  const counterpart = nameOf(row, viewerId);
  const requested = row.status === 'REQUESTED';
  const expired = requested && isExpired(row.expiresAt, now);
  const monthFull = fullMonths.has(monthKey(row.startsAt));
  const linkNeeded =
    row.status === 'CONFIRMED' &&
    row.mode === 'ONLINE' &&
    row.meetUrl === null &&
    row.calendarFailedAt !== null;
  const mentorCanAnswer = role === 'MENTOR' && requested && !expired;
  const confirmBlockedReason =
    role === 'MENTOR' && requested
      ? expired
        ? ('EXPIRED' as const)
        : monthFull
          ? ('CAPACITY_FULL' as const)
          : null
      : null;
  const cancellable =
    isCancellable(row.status, row.startsAt, now) &&
    (role === 'MENTEE' || row.status === 'CONFIRMED');
  return appointmentViewSchema.parse({
    id: row.id,
    status: row.status,
    role,
    counterpart: { userId: counterpart.id, displayName: counterpart.name },
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    mode: row.mode,
    note: row.menteeNote,
    location: row.location,
    meetUrl: row.meetUrl,
    linkNeeded,
    expiresAt: requested ? row.expiresAt : null,
    decidedAt: row.decidedAt,
    cancelledBy: row.cancelledBySystem
      ? 'SYSTEM'
      : row.cancelledById === null
        ? null
        : row.cancelledById === row.mentorId
          ? 'MENTOR'
          : 'MENTEE',
    cancelReason: row.status === 'DECLINED' ? row.decisionNote : row.cancelReason,
    createdAt: row.createdAt,
    actions: {
      canConfirm: mentorCanAnswer && !monthFull,
      confirmBlockedReason,
      canDecline: mentorCanAnswer,
      canCancel: cancellable,
      canSetLink: role === 'MENTOR' && linkNeeded && row.startsAt.getTime() > now.getTime(),
      canDownloadIcs: row.status === 'CONFIRMED',
    },
  });
}

/** Bildirimleri commit'ten sonra gönderir; hata randevuyu etkilemez. */
export async function dispatchNotices(
  deps: Pick<AppointmentDeps, 'notifier'>,
  notices: AppointmentNotice[],
) {
  for (const notice of notices) {
    try {
      await deps.notifier.notify(notice);
    } catch {
      // En iyi gayret: kuyruk hatası randevu durumunu geri almaz (ayrıntı loglanmaz).
    }
  }
}

export function noticeFor(
  event: AppointmentNotice['event'],
  row: AppointmentRow,
  to: 'MENTOR' | 'MENTEE',
  extra: Partial<AppointmentNotice> = {},
): AppointmentNotice {
  const recipient = to === 'MENTOR' ? row.mentor : row.mentee;
  const counterpart = to === 'MENTOR' ? row.mentee : row.mentor;
  return {
    event,
    appointmentId: row.id,
    recipient: { userId: recipient.id, email: recipient.email },
    counterpartName: counterpart.name,
    startsAt: row.startsAt,
    mode: row.mode,
    meetUrl: row.meetUrl,
    location: row.location,
    ...extra,
  };
}

// ---------------------------------------------------------------------------------------------
// Mentor ayarları
// ---------------------------------------------------------------------------------------------

/** Mezun/akademisyen mentor olabilir; öğrenci K-08 eşiğini (3. sınıf + yayınlanmış deneyim) geçmişse. */
async function isMentorEligible(tx: Tx, actor: Actor, now: Date): Promise<boolean> {
  const verified = actor.facts.memberships.filter(
    (membership) => membership.verificationStatus === 'VERIFIED' && membership.endedAt === null,
  );
  if (verified.some((membership) => membership.role === 'ALUMNI' || membership.role === 'ACADEMIC'))
    return true;
  if (!verified.some((membership) => membership.role === 'STUDENT')) return false;
  return (await onboardingSnapshot(tx, actor.userId, now)).mentorStepAvailable;
}

async function settingsView(
  tx: Tx,
  userId: string,
  eligible: boolean,
): Promise<MentorSettingsView> {
  const [profile, rules] = await Promise.all([
    tx.mentorProfile.findUnique({ where: { userId } }),
    tx.availabilityRule.findMany({
      where: { mentorId: userId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    }),
  ]);
  return mentorSettingsViewSchema.parse({
    eligible,
    settings: profile
      ? {
          monthlyCapacity: profile.monthlyCapacity,
          sessionMinutes: profile.sessionMinutes,
          meetingModes: profile.meetingModes,
          inPersonNote: profile.inPersonNote,
          isActive: profile.isActive,
          pausedUntil: profile.pausedUntil,
        }
      : null,
    rules: rules.map((rule) => ({
      weekday: rule.weekday,
      startMinute: rule.startMinute,
      endMinute: rule.endMinute,
      mode: rule.mode,
    })),
  });
}

export async function getMyMentorSettings(
  deps: AppointmentDeps,
  userId: string,
): Promise<MentorSettingsView> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await requireMember(tx, userId, now);
    return settingsView(tx, userId, await isMentorEligible(tx, actor, now));
  }, TX);
}

export async function saveMentorSettings(
  deps: AppointmentDeps,
  userId: string,
  input: SaveMentorSettingsInput,
): Promise<MentorSettingsView> {
  const parsed = saveMentorSettingsSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const actor = await requireMember(tx, userId, now);
    if (!(await isMentorEligible(tx, actor, now))) throw codedForbidden('MENTOR_NOT_ELIGIBLE');
    const data = {
      isActive: parsed.isActive,
      monthlyCapacity: parsed.monthlyCapacity,
      sessionMinutes: parsed.sessionMinutes,
      meetingModes: parsed.meetingModes,
      inPersonNote: parsed.meetingModes.includes('IN_PERSON') ? parsed.inPersonNote : null,
    };
    await tx.mentorProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return settingsView(tx, userId, true);
  }, TX);
}

export async function saveAvailability(
  deps: AppointmentDeps,
  userId: string,
  input: SaveAvailabilityInput,
): Promise<MentorSettingsView> {
  const parsed = saveAvailabilitySchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const actor = await requireMember(tx, userId, now);
    if (!(await isMentorEligible(tx, actor, now))) throw codedForbidden('MENTOR_NOT_ELIGIBLE');
    await tx.availabilityRule.deleteMany({ where: { mentorId: userId } });
    try {
      await tx.availabilityRule.createMany({
        data: parsed.rules.map((rule) => ({ mentorId: userId, ...rule })),
      });
    } catch {
      throw codedValidation('MENTOR_SETTINGS_INVALID');
    }
    return settingsView(tx, userId, true);
  }, TX);
}

export async function setPause(
  deps: AppointmentDeps,
  userId: string,
  input: SetPauseInput,
): Promise<MentorSettingsView> {
  const parsed = setPauseSchema.parse(input);
  const now = nowOf(deps);
  if (
    parsed.pausedUntil !== null &&
    (parsed.pausedUntil.getTime() <= now.getTime() ||
      parsed.pausedUntil.getTime() > now.getTime() + PAUSE_MAX_DAYS * DAY)
  ) {
    throw codedValidation('VALIDATION_INVALID');
  }
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const actor = await requireMember(tx, userId, now);
    const updated = await tx.mentorProfile.updateMany({
      where: { userId },
      data: { pausedUntil: parsed.pausedUntil },
    });
    if (updated.count === 0) throw codedForbidden('MENTOR_NOT_ELIGIBLE');
    return settingsView(tx, userId, await isMentorEligible(tx, actor, now));
  }, TX);
}

// ---------------------------------------------------------------------------------------------
// Slotlar ve talep
// ---------------------------------------------------------------------------------------------

async function loadVisibleMentor(tx: Tx, actor: Actor, mentorId: string, now: Date) {
  if (mentorId === actor.userId) throw codedNotFound('RESOURCE_NOT_FOUND');
  const universityIds = await viewerUniversityIds(tx as unknown as PrismaClient, actor);
  const mentor = await tx.mentorProfile.findFirst({
    where: { ...visibleMentorWhere(universityIds, actor.userId, {}, now), userId: mentorId },
    select: {
      userId: true,
      monthlyCapacity: true,
      sessionMinutes: true,
      meetingModes: true,
      inPersonNote: true,
      pausedUntil: true,
      user: { select: { name: true } },
    },
  });
  if (!mentor) throw codedNotFound('RESOURCE_NOT_FOUND');
  return mentor;
}

async function slotsOf(tx: Tx, mentor: Awaited<ReturnType<typeof loadVisibleMentor>>, now: Date) {
  const [rules, busy, fullMonths] = await Promise.all([
    tx.availabilityRule.findMany({ where: { mentorId: mentor.userId } }),
    tx.appointment.findMany({
      where: {
        mentorId: mentor.userId,
        status: { in: ['REQUESTED', 'CONFIRMED'] },
        endsAt: { gt: now },
      },
      select: { startsAt: true, endsAt: true },
    }),
    fullMonthsOf(tx, mentor.userId, mentor.monthlyCapacity, now),
  ]);
  return {
    rules,
    fullMonths,
    slots: generateSlots({
      rules: rules.map((rule) => ({
        weekday: rule.weekday,
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
        mode: rule.mode,
      })),
      sessionMinutes: mentor.sessionMinutes,
      meetingModes: mentor.meetingModes as MeetingModeName[],
      now,
      busy,
      pausedUntil: mentor.pausedUntil,
      fullMonths,
    }),
  };
}

export async function listSlots(
  deps: AppointmentDeps,
  userId: string,
  input: ListSlotsInput,
): Promise<SlotList> {
  const parsed = listSlotsSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await requireMember(tx, userId, now);
    const mentor = await loadVisibleMentor(tx, actor, parsed.mentorId, now);
    const { rules, slots, fullMonths } = await slotsOf(tx, mentor, now);
    const paused = mentor.pausedUntil !== null && mentor.pausedUntil.getTime() > now.getTime();
    const unavailableReason =
      slots.length > 0
        ? null
        : paused && mentor.pausedUntil!.getTime() > now.getTime() + SLOT_HORIZON_DAYS * DAY
          ? ('PAUSED' as const)
          : fullMonths.size > 0 && fullMonths.has(monthKey(now))
            ? ('CAPACITY_FULL' as const)
            : paused
              ? ('PAUSED' as const)
              : rules.length === 0
                ? ('NO_AVAILABILITY' as const)
                : null;
    return slotListSchema.parse({
      mentor: {
        userId: mentor.userId,
        displayName: mentor.user.name,
        sessionMinutes: mentor.sessionMinutes,
        inPersonNote: mentor.meetingModes.includes('IN_PERSON') ? mentor.inPersonNote : null,
      },
      slots,
      unavailableReason,
      emailShared: true,
    });
  }, TX);
}

export async function requestAppointment(
  deps: AppointmentDeps,
  userId: string,
  input: RequestAppointmentInput,
): Promise<AppointmentView> {
  const parsed = requestAppointmentSchema.parse(input);
  const now = nowOf(deps);
  let notices: AppointmentNotice[] = [];
  const view = await deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const actor = await requireMember(tx, userId, now);
    const mentor = await loadVisibleMentor(tx, actor, parsed.mentorId, now);
    if (
      mentor.pausedUntil !== null &&
      mentor.pausedUntil.getTime() > now.getTime() &&
      mentor.pausedUntil.getTime() > parsed.startsAt.getTime()
    ) {
      throw codedConflict('APPOINTMENT_MENTOR_UNAVAILABLE');
    }
    // Ayın kapasitesi doluysa talep bile alınmaz (onayda yine denetlenir).
    if (
      !hasCapacity(
        await confirmedInMonth(tx, mentor.userId, parsed.startsAt),
        mentor.monthlyCapacity,
      )
    ) {
      throw codedConflict('APPOINTMENT_CAPACITY_FULL');
    }
    const { slots } = await slotsOf(tx, mentor, now);
    const slot = findSlot(slots, parsed.startsAt, parsed.mode);
    if (!slot) throw codedConflict('APPOINTMENT_SLOT_INVALID');
    await consumeRateLimit(
      tx,
      {
        name: 'appointment-request',
        limit: APPOINTMENT_REQUEST_RATE_LIMIT.maxRequests,
        windowMs: APPOINTMENT_REQUEST_RATE_LIMIT.windowSeconds * 1000,
      },
      userId,
      now,
    );
    let created: { id: string };
    try {
      created = await tx.appointment.create({
        data: {
          mentorId: mentor.userId,
          menteeId: userId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          mode: parsed.mode,
          menteeNote: parsed.note ?? null,
          expiresAt: computeExpiresAt(now, slot.startsAt),
        },
        select: { id: true },
      });
    } catch (error) {
      if (isOverlap(error)) throw codedConflict('APPOINTMENT_SLOT_TAKEN');
      if (isOpenRequestConflict(error)) throw codedConflict('APPOINTMENT_OPEN_REQUEST_EXISTS');
      throw error;
    }
    const row = await tx.appointment.findUniqueOrThrow({
      where: { id: created.id },
      select: appointmentSelect,
    });
    notices = [noticeFor('requested', row, 'MENTOR', { expiresAt: row.expiresAt })];
    return toView(row, userId, now, new Set());
  }, TX);
  await dispatchNotices(deps, notices);
  return view;
}

// ---------------------------------------------------------------------------------------------
// Yanıt, iptal, link
// ---------------------------------------------------------------------------------------------

export async function respondAppointment(
  deps: AppointmentDeps,
  userId: string,
  input: RespondAppointmentInput,
): Promise<AppointmentView> {
  const parsed = respondAppointmentSchema.parse(input);
  const now = nowOf(deps);
  let notices: AppointmentNotice[] = [];
  const view = await deps.db.$transaction(async (tx) => {
    await requireMember(tx, userId, now);
    const peek = await tx.appointment.findUnique({
      where: { id: parsed.appointmentId },
      select: { mentorId: true },
    });
    if (!peek || peek.mentorId !== userId) throw codedNotFound('RESOURCE_NOT_FOUND');
    // Kilit sırası: mentor profili (kapasite sayımını serileştirir) → randevu satırı.
    const profile = await tx.$queryRaw<{ monthlyCapacity: number; inPersonNote: string | null }[]>`
      SELECT "monthlyCapacity", "inPersonNote" FROM "MentorProfile" WHERE "userId" = ${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${parsed.appointmentId} FOR UPDATE`;
    const row = await tx.appointment.findUniqueOrThrow({
      where: { id: parsed.appointmentId },
      select: appointmentSelect,
    });
    if (row.status === 'EXPIRED') throw codedConflict('APPOINTMENT_EXPIRED');
    if (row.status !== 'REQUESTED') throw codedConflict('APPOINTMENT_NOT_REQUESTED');
    if (isExpired(row.expiresAt, now)) throw codedConflict('APPOINTMENT_EXPIRED');

    if (parsed.decision === 'DECLINE') {
      if (!canTransition('REQUESTED', 'DECLINED', 'MENTOR'))
        throw codedConflict('APPOINTMENT_NOT_REQUESTED');
      await tx.appointment.update({
        where: { id: row.id },
        data: { status: 'DECLINED', decidedAt: now, decisionNote: parsed.reason ?? null },
      });
      const next = await tx.appointment.findUniqueOrThrow({
        where: { id: row.id },
        select: appointmentSelect,
      });
      notices = [noticeFor('declined', next, 'MENTEE', { reason: parsed.reason ?? null })];
      return toView(next, userId, now, new Set());
    }

    // CONFIRM
    if (!canTransition('REQUESTED', 'CONFIRMED', 'MENTOR'))
      throw codedConflict('APPOINTMENT_NOT_REQUESTED');
    const capacity = profile[0]?.monthlyCapacity ?? 0;
    if (!hasCapacity(await confirmedInMonth(tx, userId, row.startsAt), capacity)) {
      throw codedConflict('APPOINTMENT_CAPACITY_FULL');
    }
    const immediateReminder = needsImmediateReminder(now, row.startsAt);
    try {
      await tx.appointment.update({
        where: { id: row.id },
        data: {
          status: 'CONFIRMED',
          decidedAt: now,
          location: row.mode === 'IN_PERSON' ? (profile[0]?.inPersonNote ?? null) : null,
          // Takvim kapalıysa link hemen "gerekli" olur; açıksa süpürme etkinliği oluşturur.
          ...(row.mode === 'ONLINE' && deps.calendar === null ? { calendarFailedAt: now } : {}),
          ...(immediateReminder ? { reminderSentAt: now } : {}),
        },
      });
    } catch (error) {
      if (isOverlap(error)) throw codedConflict('APPOINTMENT_SLOT_TAKEN');
      throw error;
    }
    const next = await tx.appointment.findUniqueOrThrow({
      where: { id: row.id },
      select: appointmentSelect,
    });
    notices = [
      noticeFor('confirmed', next, 'MENTEE', { withReminder: immediateReminder }),
      ...(next.mode === 'ONLINE' && deps.calendar === null
        ? [noticeFor('linkNeeded', next, 'MENTOR')]
        : []),
    ];
    return toView(next, userId, now, new Set());
  }, TX);
  await dispatchNotices(deps, notices);
  return view;
}

export async function cancelAppointment(
  deps: AppointmentDeps,
  userId: string,
  input: CancelAppointmentInput,
): Promise<AppointmentView> {
  const parsed = cancelAppointmentSchema.parse(input);
  const now = nowOf(deps);
  let notices: AppointmentNotice[] = [];
  const view = await deps.db.$transaction(async (tx) => {
    await requireMember(tx, userId, now);
    await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${parsed.appointmentId} FOR UPDATE`;
    const row = await tx.appointment.findUnique({
      where: { id: parsed.appointmentId },
      select: appointmentSelect,
    });
    if (!row || (row.mentorId !== userId && row.menteeId !== userId))
      throw codedNotFound('RESOURCE_NOT_FOUND');
    const actor = row.mentorId === userId ? ('MENTOR' as const) : ('MENTEE' as const);
    if (
      !isCancellable(row.status, row.startsAt, now) ||
      !canTransition(row.status, 'CANCELLED', actor)
    ) {
      throw codedConflict('APPOINTMENT_NOT_CANCELLABLE');
    }
    await tx.appointment.update({
      where: { id: row.id },
      data: { status: 'CANCELLED', cancelledById: userId, cancelReason: parsed.reason ?? null },
    });
    const next = await tx.appointment.findUniqueOrThrow({
      where: { id: row.id },
      select: appointmentSelect,
    });
    notices = [
      noticeFor('cancelled', next, actor === 'MENTOR' ? 'MENTEE' : 'MENTOR', {
        reason: parsed.reason ?? null,
      }),
    ];
    return toView(next, userId, now, new Set());
  }, TX);
  await dispatchNotices(deps, notices);
  // Etkinlik silme `appointment-jobs` süpürmesindedir (iptal edilmiş + etkinlik kimliği dolu satır); burada hızlı deneme.
  await tryDeleteEvent(deps, parsed.appointmentId);
  return view;
}

/** İptal edilmiş randevunun takvim etkinliğini siler; hata sessizdir (süpürme yeniden dener). */
export async function tryDeleteEvent(deps: AppointmentDeps, appointmentId: string): Promise<void> {
  if (!deps.calendar) return;
  try {
    const row = await deps.db.appointment.findUnique({
      where: { id: appointmentId },
      select: { status: true, calendarEventId: true },
    });
    if (!row || row.status !== 'CANCELLED' || !row.calendarEventId) return;
    await deps.calendar.deleteEvent(row.calendarEventId);
    await deps.db.appointment.updateMany({
      where: { id: appointmentId, calendarEventId: row.calendarEventId },
      data: { calendarEventId: null },
    });
  } catch {
    // Sonraki süpürmede yeniden denenir.
  }
}

export async function setMeetLink(
  deps: AppointmentDeps,
  userId: string,
  input: SetMeetLinkInput,
): Promise<AppointmentView> {
  const parsed = setMeetLinkSchema.parse(input);
  const now = nowOf(deps);
  let notices: AppointmentNotice[] = [];
  const view = await deps.db.$transaction(async (tx) => {
    await requireMember(tx, userId, now);
    await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${parsed.appointmentId} FOR UPDATE`;
    const row = await tx.appointment.findUnique({
      where: { id: parsed.appointmentId },
      select: appointmentSelect,
    });
    if (!row || row.mentorId !== userId) throw codedNotFound('RESOURCE_NOT_FOUND');
    const needed =
      row.status === 'CONFIRMED' &&
      row.mode === 'ONLINE' &&
      row.meetUrl === null &&
      row.calendarFailedAt !== null &&
      row.startsAt.getTime() > now.getTime();
    if (!needed) throw codedConflict('APPOINTMENT_LINK_NOT_NEEDED');
    await tx.appointment.update({ where: { id: row.id }, data: { meetUrl: parsed.url } });
    const next = await tx.appointment.findUniqueOrThrow({
      where: { id: row.id },
      select: appointmentSelect,
    });
    notices = [noticeFor('linkAdded', next, 'MENTEE')];
    return toView(next, userId, now, new Set());
  }, TX);
  await dispatchNotices(deps, notices);
  return view;
}

// ---------------------------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------------------------

async function fullMonthsForRows(
  tx: Tx,
  rows: AppointmentRow[],
  viewerId: string,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const mentorRows = rows.filter((row) => row.mentorId === viewerId && row.status === 'REQUESTED');
  if (mentorRows.length === 0) return out;
  const profile = await tx.mentorProfile.findUnique({
    where: { userId: viewerId },
    select: { monthlyCapacity: true },
  });
  const capacity = profile?.monthlyCapacity ?? 0;
  const full = new Set<string>();
  const seen = new Set<string>();
  for (const row of mentorRows) {
    const key = monthKey(row.startsAt);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!hasCapacity(await confirmedInMonth(tx, viewerId, row.startsAt), capacity)) full.add(key);
  }
  out.set(viewerId, full);
  return out;
}

export async function listMyAppointments(
  deps: AppointmentDeps,
  userId: string,
  input: ListMyAppointmentsInput,
): Promise<AppointmentPage> {
  const parsed = listMyAppointmentsSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await requireMember(tx, userId, now);
    const rows = await tx.appointment.findMany({
      where: {
        ...(parsed.role === 'MENTOR' ? { mentorId: userId } : { menteeId: userId }),
        ...(parsed.statuses ? { status: { in: parsed.statuses } } : {}),
        ...(parsed.cursor ? { id: { lt: parsed.cursor } } : {}),
      },
      select: appointmentSelect,
      orderBy: { id: 'desc' },
      take: parsed.limit + 1,
    });
    const items = rows.slice(0, parsed.limit);
    const full = (await fullMonthsForRows(tx, items, userId)).get(userId) ?? new Set<string>();
    return appointmentPageSchema.parse({
      items: items.map((row) => toView(row, userId, now, full)),
      nextCursor: rows.length > parsed.limit ? (items.at(-1)?.id ?? null) : null,
    });
  }, TX);
}

async function loadParticipantRow(tx: Tx, userId: string, appointmentId: string) {
  const row = await tx.appointment.findUnique({
    where: { id: appointmentId },
    select: appointmentSelect,
  });
  if (!row || (row.mentorId !== userId && row.menteeId !== userId))
    throw codedNotFound('RESOURCE_NOT_FOUND');
  return row;
}

export async function getAppointment(
  deps: AppointmentDeps,
  userId: string,
  input: AppointmentIdInput,
): Promise<AppointmentView> {
  const parsed = appointmentIdSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await requireMember(tx, userId, now);
    const row = await loadParticipantRow(tx, userId, parsed.appointmentId);
    const full = (await fullMonthsForRows(tx, [row], userId)).get(userId) ?? new Set<string>();
    return toView(row, userId, now, full);
  }, TX);
}

/** `.ics` içeriği: yalnız iki katılımcı, yalnız onaylı randevu. Katılımcı e-postası içermez. */
export async function getAppointmentIcs(
  deps: AppointmentDeps,
  userId: string,
  input: AppointmentIdInput,
): Promise<string> {
  const parsed = appointmentIdSchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await requireMember(tx, userId, now);
    const row = await loadParticipantRow(tx, userId, parsed.appointmentId);
    if (row.status !== 'CONFIRMED') throw codedNotFound('RESOURCE_NOT_FOUND');
    const counterpart = nameOf(row, userId);
    return buildIcs({
      uid: row.id,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      summary: `MezunPortal görüşmesi: ${counterpart.name}`,
      description: row.menteeNote ? `Not: ${row.menteeNote}` : null,
      location: row.mode === 'IN_PERSON' ? row.location : null,
      url: row.mode === 'ONLINE' ? row.meetUrl : null,
      now,
    });
  }, TX);
}

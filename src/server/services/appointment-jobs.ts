import 'server-only';

import { CalendarError } from '../external/calendar/types';
import { reminderDueAt } from '../rules/appointmentLifecycle';
import { hasActiveConsent } from '../rules/consent';
import {
  appointmentSelect,
  dispatchNotices,
  noticeFor,
  nowOf,
  tryDeleteEvent,
  type AppointmentDeps,
  type AppointmentRow,
} from './appointment';
import type { AppointmentNotice } from './appointment-notifier';

/**
 * Randevu arka plan işleri (pg-boss süpürmesi `appointment.sweep` bunları çağırır; her biri tek başına, tekrar
 * çalıştırılabilir ve testlidir). Dış servis çağrısı DB işlemi dışındadır.
 *  1. `expireDueRequests`: yanıt süresi (D11) dolan talepler EXPIRED olur.
 *  2. `syncCalendarEvents`: onaylı online randevuya takvim etkinliği + Meet linki; en çok `CALENDAR_MAX_ATTEMPTS`
 *     deneme, sonra (ya da adaptör kapalı / yurt dışı aktarım rızası yok) mentor linki elle ekler.
 *  3. `deleteCancelledEvents`: iptal edilmiş randevuların etkinliklerini siler.
 *  4. `sendDueReminders`: başlangıca 24 saat kala hatırlatma (onayla birlikte gitmediyse).
 */
export const CALENDAR_MAX_ATTEMPTS = 3;
const BATCH = 50;

/** Süpürmeyi belirli randevulara daraltır (tek randevu için anlık çalıştırma ve testler); boşsa hepsi. */
export type SweepScope = { ids?: readonly string[] };
const only = (scope: SweepScope | undefined) => (scope?.ids ? { id: { in: [...scope.ids] } } : {});

export async function expireDueRequests(
  deps: AppointmentDeps,
  scope?: SweepScope,
): Promise<number> {
  const now = nowOf(deps);
  const due = await deps.db.appointment.findMany({
    where: { status: 'REQUESTED', expiresAt: { lte: now }, ...only(scope) },
    select: { id: true },
    orderBy: { expiresAt: 'asc' },
    take: BATCH,
  });
  let expired = 0;
  for (const { id } of due) {
    let notices: AppointmentNotice[] = [];
    const changed = await deps.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${id} FOR UPDATE`;
      const row = await tx.appointment.findUnique({ where: { id }, select: appointmentSelect });
      // Yarış: mentor az önce yanıtladıysa dokunma.
      if (!row || row.status !== 'REQUESTED' || row.expiresAt.getTime() > now.getTime())
        return false;
      await tx.appointment.update({ where: { id }, data: { status: 'EXPIRED' } });
      notices = [noticeFor('expired', row, 'MENTEE'), noticeFor('expired', row, 'MENTOR')];
      return true;
    });
    if (changed) {
      expired += 1;
      await dispatchNotices(deps, notices);
    }
  }
  return expired;
}

async function bothTransferConsents(deps: AppointmentDeps, row: AppointmentRow): Promise<boolean> {
  for (const userId of [row.mentorId, row.menteeId]) {
    const records = await deps.db.consent.findMany({
      where: { userId },
      select: { documentType: true, version: true, granted: true, createdAt: true },
    });
    if (!hasActiveConsent(records, 'CROSS_BORDER_TRANSFER')) return false;
  }
  return true;
}

async function giveUpOnCalendar(deps: AppointmentDeps, id: string, now: Date, attempts: number) {
  let notices: AppointmentNotice[] = [];
  await deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.appointment.findUnique({ where: { id }, select: appointmentSelect });
    if (!row || row.status !== 'CONFIRMED' || row.meetUrl !== null || row.calendarFailedAt !== null)
      return;
    await tx.appointment.update({
      where: { id },
      data: { calendarFailedAt: now, calendarAttempts: attempts },
    });
    notices = [noticeFor('linkNeeded', row, 'MENTOR')];
  });
  await dispatchNotices(deps, notices);
}

export async function syncCalendarEvents(
  deps: AppointmentDeps,
  scope?: SweepScope,
): Promise<{ created: number; failed: number }> {
  const now = nowOf(deps);
  const result = { created: 0, failed: 0 };
  if (!deps.calendar) return result;
  const pending = await deps.db.appointment.findMany({
    where: {
      status: 'CONFIRMED',
      mode: 'ONLINE',
      meetUrl: null,
      calendarEventId: null,
      calendarFailedAt: null,
      startsAt: { gt: now },
      ...only(scope),
    },
    select: { id: true },
    orderBy: { startsAt: 'asc' },
    take: BATCH,
  });
  for (const { id } of pending) {
    // 1) Satır kilidiyle toplam deneme hakkını ayır; dış çağrılar aynı iş anahtarıyla idempotenttir.
    const claimed = await deps.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Appointment" WHERE "id" = ${id} FOR UPDATE SKIP LOCKED`;
      if (locked.length === 0) return null;
      const row = await tx.appointment.findUnique({ where: { id }, select: appointmentSelect });
      if (
        !row ||
        row.status !== 'CONFIRMED' ||
        row.meetUrl !== null ||
        row.calendarEventId !== null ||
        row.calendarFailedAt !== null
      ) {
        return null;
      }
      if (row.calendarAttempts >= CALENDAR_MAX_ATTEMPTS) {
        return { row, attempts: row.calendarAttempts, exhausted: true };
      }
      const updated = await tx.appointment.update({
        where: { id },
        data: { calendarAttempts: { increment: 1 } },
        select: { calendarAttempts: true },
      });
      return { row, attempts: updated.calendarAttempts, exhausted: false };
    });
    if (!claimed) continue;
    const { row, attempts } = claimed;
    if (claimed.exhausted) {
      await giveUpOnCalendar(deps, id, now, attempts);
      result.failed += 1;
      continue;
    }

    // Yurt dışına aktarım rızası yoksa takvim çağrısı yapılmaz; mentor kendi linkini girer.
    if (!(await bothTransferConsents(deps, row))) {
      await giveUpOnCalendar(deps, id, now, attempts);
      result.failed += 1;
      continue;
    }
    // 2) Dış çağrı (işlem dışı, sınırlı zaman aşımı).
    try {
      const event = await deps.calendar.createEvent(
        {
          appointmentId: row.id,
          summary: `MezunPortal görüşmesi: ${row.mentor.name} – ${row.mentee.name}`,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          attendeeEmails: [row.mentor.email, row.mentee.email],
          idempotencyKey: `appointment:${row.id}`,
        },
        { signal: AbortSignal.timeout(15_000) },
      );
      // 3) Sonucu yaz; bu arada iptal edildiyse etkinliği geri sil.
      const stored = await deps.db.appointment.updateMany({
        where: { id, status: 'CONFIRMED', meetUrl: null },
        data: { meetUrl: event.meetUrl, calendarEventId: event.eventId },
      });
      if (stored.count === 0) {
        await deps.calendar.deleteEvent(event.eventId).catch(() => undefined);
        continue;
      }
      result.created += 1;
    } catch (error) {
      const retryable = error instanceof CalendarError ? error.retryable : true;
      if (!retryable || attempts >= CALENDAR_MAX_ATTEMPTS) {
        await giveUpOnCalendar(deps, id, now, attempts);
        result.failed += 1;
      }
      // Yeniden denenebilir ve hak varsa sonraki süpürmede tekrar denenir.
    }
  }
  return result;
}

export async function deleteCancelledEvents(
  deps: AppointmentDeps,
  scope?: SweepScope,
): Promise<number> {
  if (!deps.calendar) return 0;
  const rows = await deps.db.appointment.findMany({
    where: { status: 'CANCELLED', calendarEventId: { not: null }, ...only(scope) },
    select: { id: true },
    take: BATCH,
  });
  for (const { id } of rows) await tryDeleteEvent(deps, id);
  return rows.length;
}

export async function sendDueReminders(deps: AppointmentDeps, scope?: SweepScope): Promise<number> {
  const now = nowOf(deps);
  // Başlangıca 24 saat veya daha az kaldıysa ve henüz başlamadıysa.
  const due = await deps.db.appointment.findMany({
    where: {
      status: 'CONFIRMED',
      reminderSentAt: null,
      startsAt: { gt: now, lte: new Date(now.getTime() + 24 * 3_600_000) },
      ...only(scope),
    },
    select: { id: true },
    orderBy: { startsAt: 'asc' },
    take: BATCH,
  });
  let sent = 0;
  for (const { id } of due) {
    let notices: AppointmentNotice[] = [];
    const marked = await deps.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${id} FOR UPDATE`;
      const row = await tx.appointment.findUnique({ where: { id }, select: appointmentSelect });
      if (!row || row.status !== 'CONFIRMED' || row.reminderSentAt !== null) return false;
      if (reminderDueAt(row.startsAt).getTime() > now.getTime()) return false;
      await tx.appointment.update({ where: { id }, data: { reminderSentAt: now } });
      notices = [noticeFor('reminder', row, 'MENTOR'), noticeFor('reminder', row, 'MENTEE')];
      return true;
    });
    if (marked) {
      sent += 1;
      await dispatchNotices(deps, notices);
    }
  }
  return sent;
}

/** Süpürme: dört adım sırayla; biri hata verse diğerleri çalışır. */
export async function runAppointmentSweep(deps: AppointmentDeps, scope?: SweepScope) {
  const outcome = {
    expired: 0,
    calendarCreated: 0,
    calendarFailed: 0,
    eventsDeleted: 0,
    reminders: 0,
  };
  const guard = async (run: () => Promise<void>) => {
    try {
      await run();
    } catch {
      // Ayrıntı loglanmaz; sonraki süpürmede yeniden denenir.
    }
  };
  await guard(async () => void (outcome.expired = await expireDueRequests(deps, scope)));
  await guard(async () => {
    const sync = await syncCalendarEvents(deps, scope);
    outcome.calendarCreated = sync.created;
    outcome.calendarFailed = sync.failed;
  });
  await guard(async () => void (outcome.eventsDeleted = await deleteCancelledEvents(deps, scope)));
  await guard(async () => void (outcome.reminders = await sendDueReminders(deps, scope)));
  return outcome;
}

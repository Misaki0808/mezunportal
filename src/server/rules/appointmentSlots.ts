import {
  SLOT_HORIZON_DAYS,
  SLOT_LEAD_HOURS,
  TIME_ZONE_OFFSET_MINUTES,
  type AvailabilityRule,
} from '@/contracts/appointment';
import type { MeetingModeName } from '@/contracts/mentor-directory';

/**
 * Slot üretimi (saf). Haftalık müsaitlik `Europe/Istanbul` yerel dakikalarıdır (UTC+3 sabit, yaz saati yok);
 * çıktı UTC anlarıdır. Slot, kuralın penceresine mentorun görüşme süresi adımıyla dizilir (pencereye tam sığmayan
 * artık slot üretilmez). Çıkarılanlar: şimdiden `leadHours` içinde başlayan, ufuktan (`horizonDays`) sonra başlayan,
 * mentorun dolu aralıklarıyla (REQUESTED/CONFIRMED) kesişen, "müsait değilim" tarihinden önce başlayan ve takvim
 * ayı kapasitesi dolmuş slotlar.
 */
export type Slot = { startsAt: Date; endsAt: Date; modes: MeetingModeName[] };
export type BusyInterval = { startsAt: Date; endsAt: Date };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const OFFSET_MS = TIME_ZONE_OFFSET_MINUTES * MINUTE;

/** `YYYY-MM`: anın İstanbul takvim ayı. */
export function monthKey(date: Date): string {
  const local = new Date(date.getTime() + OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** İstanbul takvim ayının [başı, sonu) UTC aralığı (kapasite sayımı). */
export function monthRange(date: Date): { from: Date; to: Date } {
  const local = new Date(date.getTime() + OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month, 1) - OFFSET_MS),
    to: new Date(Date.UTC(year, month + 1, 1) - OFFSET_MS),
  };
}

const overlaps = (a: BusyInterval, b: BusyInterval) =>
  a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();

export function generateSlots(input: {
  rules: readonly AvailabilityRule[];
  sessionMinutes: number;
  meetingModes: readonly MeetingModeName[];
  now: Date;
  busy?: readonly BusyInterval[];
  pausedUntil?: Date | null;
  /** Kapasitesi dolan takvim ayları (`monthKey`). */
  fullMonths?: ReadonlySet<string>;
  horizonDays?: number;
  leadHours?: number;
}): Slot[] {
  const horizon = input.now.getTime() + (input.horizonDays ?? SLOT_HORIZON_DAYS) * DAY;
  const earliest = input.now.getTime() + (input.leadHours ?? SLOT_LEAD_HOURS) * HOUR;
  const busy = input.busy ?? [];
  const slots: Slot[] = [];

  // İstanbul yerel günü: bugünün yerel başlangıcından ufka kadar.
  const localNow = new Date(input.now.getTime() + OFFSET_MS);
  const firstDayStart =
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - OFFSET_MS;
  const dayCount = (input.horizonDays ?? SLOT_HORIZON_DAYS) + 2;

  for (let index = 0; index < dayCount; index += 1) {
    const dayStart = firstDayStart + index * DAY;
    const weekday = ((new Date(dayStart + OFFSET_MS).getUTCDay() + 6) % 7) + 1; // 1 = pazartesi
    for (const rule of input.rules) {
      if (rule.weekday !== weekday) continue;
      const modes = rule.mode
        ? input.meetingModes.filter((mode) => mode === rule.mode)
        : [...input.meetingModes];
      if (modes.length === 0) continue;
      for (
        let minute = rule.startMinute;
        minute + input.sessionMinutes <= rule.endMinute;
        minute += input.sessionMinutes
      ) {
        const startsAt = new Date(dayStart + minute * MINUTE);
        const endsAt = new Date(startsAt.getTime() + input.sessionMinutes * MINUTE);
        if (startsAt.getTime() < earliest || startsAt.getTime() >= horizon) continue;
        if (input.pausedUntil && startsAt.getTime() < input.pausedUntil.getTime()) continue;
        if (input.fullMonths?.has(monthKey(startsAt))) continue;
        if (busy.some((interval) => overlaps({ startsAt, endsAt }, interval))) continue;
        slots.push({ startsAt, endsAt, modes });
      }
    }
  }
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Talep edilen an üretilmiş slotlardan biri mi? Biçim o slotta sunuluyor mu? */
export function findSlot(
  slots: readonly Slot[],
  startsAt: Date,
  mode: MeetingModeName,
): Slot | null {
  return (
    slots.find(
      (slot) => slot.startsAt.getTime() === startsAt.getTime() && slot.modes.includes(mode),
    ) ?? null
  );
}

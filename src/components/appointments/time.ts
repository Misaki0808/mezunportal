import { APPOINTMENT_TIME_ZONE } from '@/contracts/appointment';

/** Randevu saatleri `Europe/Istanbul`'dur (sözleşme); ekran tarayıcının saat diliminden BAĞIMSIZ aynı saati gösterir. */
const TZ = APPOINTMENT_TIME_ZONE;

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const dayFormat = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const shortDayFormat = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const timeFormat = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const fullFormat = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const dayKey = (value: Date) => dayKeyFormat.format(new Date(value));
export const dayLabel = (value: Date) => dayFormat.format(new Date(value));
export const shortDayLabel = (value: Date) => shortDayFormat.format(new Date(value));
export const timeLabel = (value: Date) => timeFormat.format(new Date(value));
export const fullLabel = (value: Date) => fullFormat.format(new Date(value));
export const rangeLabel = (start: Date, end: Date) => `${timeLabel(start)} – ${timeLabel(end)}`;

export const minutesToTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const timeToMinutes = (time: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 1440 ? minutes : null;
};

/** Slotları İstanbul gününe göre gruplar (sıra korunur). */
export function groupSlotsByDay<T extends { startsAt: Date }>(slots: readonly T[]) {
  const groups: { key: string; date: Date; slots: T[] }[] = [];
  for (const slot of slots) {
    const key = dayKey(slot.startsAt);
    const last = groups.at(-1);
    if (last?.key === key) last.slots.push(slot);
    else groups.push({ key, date: new Date(slot.startsAt), slots: [slot] });
  }
  return groups;
}

import {
  EXPIRY_BEFORE_START_HOURS,
  REMINDER_BEFORE_HOURS,
  REQUEST_EXPIRY_HOURS,
  type AppointmentStatus,
} from '@/contracts/appointment';

/** Randevu durum makinesi ve zaman kuralları (saf). D11: talep 72 saat sonra ya da başlangıçtan 12 saat önce, erken olan. */
export type AppointmentActor = 'MENTOR' | 'MENTEE' | 'SYSTEM';

const HOUR = 3_600_000;

/** Yalnız bu geçişler vardır; geri kalanı reddedilir. COMPLETED/NO_SHOW görüşme sonrası formla (P1-14) gelir. */
const TRANSITIONS: Readonly<
  Partial<
    Record<AppointmentStatus, Partial<Record<AppointmentStatus, readonly AppointmentActor[]>>>
  >
> = {
  REQUESTED: {
    CONFIRMED: ['MENTOR'],
    DECLINED: ['MENTOR'],
    CANCELLED: ['MENTEE'],
    EXPIRED: ['SYSTEM'],
  },
  CONFIRMED: {
    CANCELLED: ['MENTOR', 'MENTEE'],
    COMPLETED: ['SYSTEM'],
    NO_SHOW: ['SYSTEM'],
  },
};

export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
  actor: AppointmentActor,
): boolean {
  return TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}

/** Talebin yanıt son tarihi: talepten 72 saat sonra ya da başlangıçtan 12 saat önce, hangisi erkense. */
export function computeExpiresAt(requestedAt: Date, startsAt: Date): Date {
  return new Date(
    Math.min(
      requestedAt.getTime() + REQUEST_EXPIRY_HOURS * HOUR,
      startsAt.getTime() - EXPIRY_BEFORE_START_HOURS * HOUR,
    ),
  );
}

/** Son tarih TAM geldiğinde süresi dolmuştur. */
export const isExpired = (expiresAt: Date, now: Date) => expiresAt.getTime() <= now.getTime();

/** Onaylı randevu başlamadıysa iptal edilebilir; talep her zaman geri çekilebilir/iptal edilebilir. */
export function isCancellable(status: AppointmentStatus, startsAt: Date, now: Date): boolean {
  if (status === 'REQUESTED') return true;
  return status === 'CONFIRMED' && startsAt.getTime() > now.getTime();
}

/** Hatırlatma, başlangıçtan 24 saat önce gider. */
export const reminderDueAt = (startsAt: Date) =>
  new Date(startsAt.getTime() - REMINDER_BEFORE_HOURS * HOUR);

/** Onay hatırlatma anından SONRA geldiyse hatırlatma onayla birlikte gider. */
export const needsImmediateReminder = (confirmedAt: Date, startsAt: Date) =>
  confirmedAt.getTime() >= reminderDueAt(startsAt).getTime();

/** Takvim ayındaki onaylı sayı kapasiteden azsa yeni onay verilebilir. */
export const hasCapacity = (confirmedInMonth: number, monthlyCapacity: number) =>
  confirmedInMonth < monthlyCapacity;

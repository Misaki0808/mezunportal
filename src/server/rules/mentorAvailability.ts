import type { MentorUnavailableReason } from '@/contracts/mentor-directory';

/**
 * Mentorun yeni talep alıp alamayacağı (saf). Üç koşul: "müsait değilim" modu (`pausedUntil` gelecekte),
 * bu ayki kapasitenin dolması (onaylı randevu sayısı ≥ aylık kapasite) ve etkin profil (çağıran süzer).
 * Sebep önceliği: `PAUSED` > `CAPACITY_FULL`. Kapasite 0 olan mentor da doludur.
 */
export type MentorAvailability = {
  available: boolean;
  reason: MentorUnavailableReason | null;
  pausedUntil: Date | null;
  monthly: number;
  used: number;
  remaining: number;
};

export function computeMentorAvailability(input: {
  pausedUntil: Date | null;
  monthlyCapacity: number;
  /** Bu takvim ayında onaylı randevu sayısı. */
  used: number;
  now: Date;
}): MentorAvailability {
  const paused = input.pausedUntil !== null && input.pausedUntil.getTime() > input.now.getTime();
  const monthly = Math.max(0, input.monthlyCapacity);
  const used = Math.max(0, input.used);
  const remaining = Math.max(0, monthly - used);
  const reason = paused ? 'PAUSED' : remaining === 0 ? 'CAPACITY_FULL' : null;
  return {
    available: reason === null,
    reason,
    pausedUntil: paused ? input.pausedUntil : null,
    monthly,
    used,
    remaining,
  };
}

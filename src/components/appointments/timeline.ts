import type { AppointmentStatus, AppointmentView } from '@/contracts/appointment';

export type TimelineStepId = 'requested' | 'confirmed' | 'meeting' | 'feedback';
export type TimelineStopId = 'DECLINED' | 'CANCELLED' | 'EXPIRED' | 'NO_SHOW';
export type TimelineState = 'done' | 'current' | 'upcoming' | 'stopped';
export type TimelineStep =
  | { kind: 'step'; id: TimelineStepId; state: Exclude<TimelineState, 'stopped'> }
  | { kind: 'stop'; id: TimelineStopId; state: 'stopped' };

type Input = { status: AppointmentStatus };

const step = (id: TimelineStepId, state: Exclude<TimelineState, 'stopped'>): TimelineStep => ({
  kind: 'step',
  id,
  state,
});
const stop = (id: TimelineStopId): TimelineStep => ({ kind: 'stop', id, state: 'stopped' });

/**
 * Randevunun yolu: talep → mentor onayı → görüşme → geri bildirim. Yalnız `status`tan türetilir (iş kuralı değil, sunum):
 * yolun bittiği durumlarda (red, iptal, süre, gelinmedi) çizelge o noktada durur ve kalan adımlar gösterilmez.
 * `feedbackPending`: kullanıcının doldurabileceği açık bir geri bildirim formu var mı (sunucu söyler).
 * İptal, onaydan önce mi sonra mı olduğunu görünümden bilemeyeceğimiz için "onaylandı" iddia etmez.
 */
export function buildTimeline(a: Input, feedbackPending: boolean): TimelineStep[] {
  switch (a.status) {
    case 'REQUESTED':
      return [
        step('requested', 'current'),
        step('confirmed', 'upcoming'),
        step('meeting', 'upcoming'),
        step('feedback', 'upcoming'),
      ];
    case 'CONFIRMED':
      return [
        step('requested', 'done'),
        step('confirmed', 'done'),
        step('meeting', 'current'),
        step('feedback', 'upcoming'),
      ];
    case 'COMPLETED':
      return [
        step('requested', 'done'),
        step('confirmed', 'done'),
        step('meeting', 'done'),
        step('feedback', feedbackPending ? 'current' : 'done'),
      ];
    case 'NO_SHOW':
      return [step('requested', 'done'), step('confirmed', 'done'), stop('NO_SHOW')];
    case 'DECLINED':
    case 'CANCELLED':
    case 'EXPIRED':
      return [step('requested', 'done'), stop(a.status)];
  }
}

/** Çizelgenin altındaki tek cümlelik yönlendirme anahtarı; ilgisiz durumda `null`. */
export function timelineHint(
  a: Pick<AppointmentView, 'status' | 'role'>,
  feedbackPending: boolean,
): 'requestedMentor' | 'requestedMentee' | 'confirmed' | 'feedback' | null {
  if (a.status === 'REQUESTED') return a.role === 'MENTOR' ? 'requestedMentor' : 'requestedMentee';
  if (a.status === 'CONFIRMED') return 'confirmed';
  if (a.status === 'COMPLETED' && feedbackPending) return 'feedback';
  return null;
}

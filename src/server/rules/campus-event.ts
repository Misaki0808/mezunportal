import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  EVENT_ATTENDANCE_MONTHLY_LIMIT,
  EVENT_CODE_PERIOD_SECONDS,
} from '@/contracts/campus-events';

export function eventAttendanceMultiplier(priorScoredCount: number): 0 | 100 {
  return priorScoredCount >= EVENT_ATTENDANCE_MONTHLY_LIMIT ? 0 : 100;
}

/** Kod yalnız belirli etkinlik ve 120 saniyelik zaman dilimi için geçerlidir. */
export function campusEventCode(eventId: string, secret: string, now: Date) {
  const period = EVENT_CODE_PERIOD_SECONDS * 1000;
  const tick = Math.floor(now.getTime() / period);
  const digest = createHmac('sha256', secret).update(`campus-event:v1:${eventId}:${tick}`).digest();
  const number = digest.readUInt32BE(0) % 1_000_000;
  return { code: String(number).padStart(6, '0'), expiresAt: new Date((tick + 1) * period) };
}

export function validCampusEventCode(input: {
  eventId: string;
  secret: string;
  code: string;
  now: Date;
  startsAt: Date;
  endsAt: Date;
}) {
  if (input.now < input.startsAt || input.now >= input.endsAt || !/^\d{6}$/.test(input.code))
    return false;
  const expected = Buffer.from(campusEventCode(input.eventId, input.secret, input.now).code);
  return timingSafeEqual(expected, Buffer.from(input.code));
}

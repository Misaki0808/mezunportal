import { describe, expect, it } from 'vitest';

import { computeMentorAvailability } from './mentorAvailability';

const NOW = new Date('2030-06-15T12:00:00Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);
const run = (patch: Partial<Parameters<typeof computeMentorAvailability>[0]> = {}) =>
  computeMentorAvailability({ pausedUntil: null, monthlyCapacity: 4, used: 0, now: NOW, ...patch });

describe('computeMentorAvailability', () => {
  it('boş kapasite ve duraklatma yok → müsait', () => {
    expect(run()).toEqual({
      available: true,
      reason: null,
      pausedUntil: null,
      monthly: 4,
      used: 0,
      remaining: 4,
    });
    expect(run({ used: 3 })).toMatchObject({ available: true, remaining: 1 });
  });

  it('kapasite tam dolduğunda müsait değil; fazla kullanım da doludur', () => {
    expect(run({ used: 4 })).toMatchObject({
      available: false,
      reason: 'CAPACITY_FULL',
      remaining: 0,
    });
    expect(run({ used: 9 })).toMatchObject({
      available: false,
      reason: 'CAPACITY_FULL',
      remaining: 0,
    });
  });

  it('kapasite 0 olan mentor müsait değildir', () => {
    expect(run({ monthlyCapacity: 0 })).toMatchObject({
      available: false,
      reason: 'CAPACITY_FULL',
    });
  });

  it('duraklatma gelecekteyse müsait değil ve bitiş tarihi döner; tam şimdi ya da geçmişse müsait', () => {
    expect(run({ pausedUntil: at(1) })).toMatchObject({
      available: false,
      reason: 'PAUSED',
      pausedUntil: at(1),
    });
    expect(run({ pausedUntil: at(0) })).toMatchObject({ available: true, pausedUntil: null });
    expect(run({ pausedUntil: at(-86_400_000) })).toMatchObject({
      available: true,
      pausedUntil: null,
    });
  });

  it('hem duraklatılmış hem dolu ise sebep PAUSED', () => {
    expect(run({ pausedUntil: at(1000), used: 4 })).toMatchObject({ reason: 'PAUSED' });
  });

  it('negatif girdiler sıfıra çekilir', () => {
    expect(run({ monthlyCapacity: -2, used: -5 })).toMatchObject({
      monthly: 0,
      used: 0,
      remaining: 0,
    });
  });
});

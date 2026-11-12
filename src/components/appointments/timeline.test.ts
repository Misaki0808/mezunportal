import { describe, expect, it } from 'vitest';

import type { AppointmentStatus } from '@/contracts/appointment';

import { buildTimeline, timelineHint } from './timeline';

const states = (status: AppointmentStatus, feedbackPending = false) =>
  buildTimeline({ status }, feedbackPending).map((item) => `${item.id}:${item.state}`);

describe('randevu zaman çizelgesi', () => {
  it('bekleyen talepte yol baştadır: talep şu an, kalanlar sırada', () => {
    expect(states('REQUESTED')).toEqual([
      'requested:current',
      'confirmed:upcoming',
      'meeting:upcoming',
      'feedback:upcoming',
    ]);
  });

  it('onaylı randevuda sıradaki adım görüşmedir', () => {
    expect(states('CONFIRMED')).toEqual([
      'requested:done',
      'confirmed:done',
      'meeting:current',
      'feedback:upcoming',
    ]);
  });

  it('tamamlanan randevuda açık geri bildirim formu varsa son adım şu andır, yoksa bitmiştir', () => {
    expect(states('COMPLETED', true).at(-1)).toBe('feedback:current');
    expect(states('COMPLETED', false).at(-1)).toBe('feedback:done');
    expect(states('COMPLETED', true).slice(0, 3)).toEqual([
      'requested:done',
      'confirmed:done',
      'meeting:done',
    ]);
  });

  it('yolun bittiği durumlarda çizelge orada durur ve kalan adımları göstermez', () => {
    expect(states('DECLINED')).toEqual(['requested:done', 'DECLINED:stopped']);
    expect(states('EXPIRED')).toEqual(['requested:done', 'EXPIRED:stopped']);
    expect(states('NO_SHOW')).toEqual(['requested:done', 'confirmed:done', 'NO_SHOW:stopped']);
  });

  it('iptal, onaydan önce mi sonra mı olduğu bilinmediği için "onaylandı" iddia etmez', () => {
    expect(states('CANCELLED')).toEqual(['requested:done', 'CANCELLED:stopped']);
  });

  it('her durumda en çok bir adım "şu an"dır ve durmuş çizelgede şu an yoktur', () => {
    const all: AppointmentStatus[] = [
      'REQUESTED',
      'CONFIRMED',
      'DECLINED',
      'CANCELLED',
      'EXPIRED',
      'COMPLETED',
      'NO_SHOW',
    ];
    for (const status of all) {
      const items = buildTimeline({ status }, true);
      const current = items.filter((item) => item.state === 'current').length;
      expect(current, status).toBeLessThanOrEqual(1);
      if (items.some((item) => item.state === 'stopped')) expect(current, status).toBe(0);
    }
  });

  it('yönlendirme cümlesi role ve duruma bağlıdır', () => {
    expect(timelineHint({ status: 'REQUESTED', role: 'MENTOR' }, false)).toBe('requestedMentor');
    expect(timelineHint({ status: 'REQUESTED', role: 'MENTEE' }, false)).toBe('requestedMentee');
    expect(timelineHint({ status: 'CONFIRMED', role: 'MENTEE' }, false)).toBe('confirmed');
    expect(timelineHint({ status: 'COMPLETED', role: 'MENTEE' }, true)).toBe('feedback');
    expect(timelineHint({ status: 'COMPLETED', role: 'MENTEE' }, false)).toBeNull();
    expect(timelineHint({ status: 'CANCELLED', role: 'MENTEE' }, true)).toBeNull();
  });
});

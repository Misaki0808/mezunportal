import { describe, expect, it } from 'vitest';
import { reliability, reliabilitySince } from './reliability';
describe('öğrenci güvenilirliği', () => {
  it.each([
    [0, 0, 'NEW'],
    [2, 0, 'NEW'],
    [2, 1, 'CAUTION'],
    [79, 21, 'CAUTION'],
    [80, 20, 'RELIABLE'],
    [3, 0, 'RELIABLE'],
  ] as const)('%i katılım, %i yoklama → %s', (yes, no, label) => {
    expect(reliability(yes, no)).toEqual({ label, total: yes + no, completed: yes, noShow: no });
  });
  it('geçersiz sayıları reddeder ve son yılın başlangıcını hesaplar', () => {
    expect(() => reliability(-1, 0)).toThrow();
    expect(reliabilitySince(new Date('2026-11-08T00:00:00Z')).toISOString()).toBe(
      '2025-11-08T00:00:00.000Z',
    );
  });
});

import { describe, expect, it } from 'vitest';

import { deriveVerificationOverall } from './verificationState';

const m = (verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED', ended = false) => ({
  verificationStatus,
  endedAt: ended ? new Date('2026-01-01') : null,
});

describe('deriveVerificationOverall', () => {
  it.each([
    ['hiçbir şey yok', [], false, null, 'NOT_STARTED'],
    ['doğrulanmış etkin üyelik', [m('VERIFIED')], false, null, 'VERIFIED'],
    ['doğrulanmış üyelik belge bekliyor olsa da VERIFIED', [m('VERIFIED')], true, null, 'VERIFIED'],
    ['kapanmış doğrulanmış üyelik sayılmaz', [m('VERIFIED', true)], false, null, 'NOT_STARTED'],
    ['yalnız bekleyen üyelik doğrulama sayılmaz', [m('PENDING')], false, null, 'NOT_STARTED'],
    ['bekleyen belge', [m('PENDING')], true, null, 'AWAITING_REVIEW'],
    [
      'bekleyen belge reddedilmiş eski belgeden önceliklidir',
      [],
      true,
      'REJECTED',
      'AWAITING_REVIEW',
    ],
    ['son belge reddedildi', [m('REJECTED', true)], false, 'REJECTED', 'REJECTED'],
    [
      'onaylanmış belge ama etkin doğrulanmış üyelik yok (bozuk durum) başlamadı sayılır',
      [],
      false,
      'APPROVED',
      'NOT_STARTED',
    ],
  ] as const)('%s → %s', (_label, memberships, hasPendingDocument, latestDecision, expected) => {
    expect(deriveVerificationOverall({ memberships, hasPendingDocument, latestDecision })).toBe(
      expected,
    );
  });
});

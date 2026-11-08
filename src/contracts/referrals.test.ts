import { describe, expect, it } from 'vitest';
import { DEFAULT_POINT_RULES } from './points';
import {
  proposeReferralSchema,
  proposeReferralAcceptanceSchema,
  respondReferralSchema,
  reviewReferralSchema,
  REFERRAL_NOTE_MAX,
  REFERRAL_ACTION_ACCESS,
} from './referrals';

describe('referans sözleşmesi', () => {
  it('referans veya kurum zorunlu; not 500 karakteri ve bilinmeyen alanı geçemez', () => {
    expect(proposeReferralSchema.safeParse({ studentId: 's' }).success).toBe(false);
    expect(
      proposeReferralSchema.safeParse({
        studentId: 's',
        organizationName: 'Kurum',
        note: 'a'.repeat(REFERRAL_NOTE_MAX),
      }).success,
    ).toBe(true);
    expect(
      proposeReferralSchema.safeParse({
        studentId: 's',
        jobPostingId: 'ilan',
        note: 'a'.repeat(REFERRAL_NOTE_MAX + 1),
      }).success,
    ).toBe(false);
    expect(
      proposeReferralSchema.safeParse({ studentId: 's', organizationName: 'Kurum', file: 'belge' })
        .success,
    ).toBe(false);
  });
  it('öğrencinin ret kararında gerekçe veya kimlik kabul edilmez; yönetici reddinde gerekçe zorunludur', () => {
    expect(respondReferralSchema.safeParse({ referralId: 'r', decision: 'REJECT' }).success).toBe(
      true,
    );
    expect(
      respondReferralSchema.safeParse({ referralId: 'r', decision: 'REJECT', reason: 'gizli' })
        .success,
    ).toBe(false);
    expect(
      reviewReferralSchema.safeParse({ referralId: 'r', stage: 'REFERRAL', decision: 'REJECT' })
        .success,
    ).toBe(false);
    expect(
      reviewReferralSchema.safeParse({
        referralId: 'r',
        stage: 'ACCEPTANCE',
        decision: 'REJECT',
        reason: 'Yeterli kanıt yok',
      }).success,
    ).toBe(true);
    expect(
      proposeReferralAcceptanceSchema.safeParse({ referralId: 'r', note: 'a'.repeat(501) }).success,
    ).toBe(false);
  });
  it('puan değerleri ve 14 günlük gecikme PM kararını yansıtır', () => {
    expect(DEFAULT_POINT_RULES.REFERRAL_GIVEN).toEqual({ points: 20, delayDays: 14 });
    expect(DEFAULT_POINT_RULES.REFERRAL_ACCEPTED).toEqual({ points: 30, delayDays: 14 });
    expect(REFERRAL_ACTION_ACCESS.reviewReferral).toBe('ANY_ADMIN');
    expect(REFERRAL_ACTION_ACCESS.listReferralCandidates).toBe('ALUMNI');
  });
});

/**
 * Doğrulama durumu (ekranın “şimdi ne yapmalıyım?” cevabı). Saf kural: üyelik ve belge olgularından
 * genel durumu türetir (`src/contracts/auth.ts` `verificationOverallSchema`).
 *
 * Öncelik: doğrulanmış etkin üyelik > bekleyen belge > son belge reddedildi > başlamadı.
 */
export type VerificationOverall = 'VERIFIED' | 'AWAITING_REVIEW' | 'REJECTED' | 'NOT_STARTED';

export function deriveVerificationOverall(input: {
  memberships: readonly {
    verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
    endedAt: Date | null;
  }[];
  hasPendingDocument: boolean;
  /** Kullanıcının en son KARAR verilmiş belgesinin sonucu (yoksa `null`). */
  latestDecision: 'APPROVED' | 'REJECTED' | null;
}): VerificationOverall {
  const verified = input.memberships.some(
    (membership) => membership.endedAt === null && membership.verificationStatus === 'VERIFIED',
  );
  if (verified) return 'VERIFIED';
  if (input.hasPendingDocument) return 'AWAITING_REVIEW';
  if (input.latestDecision === 'REJECTED') return 'REJECTED';
  return 'NOT_STARTED';
}

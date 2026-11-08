import type { ExperienceDetail } from '@/contracts/experience';

type Status = ExperienceDetail['status'];
export function canEditExperience(status: Status): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}
/** K-07: yayınlanmış içerik aynı üniversiteye; diğer durumlar sahibi veya kapsayan moderatöre. */
export function canReadExperience(input: {
  status: Status;
  isOwner: boolean;
  sameUniversity: boolean;
  canModerate: boolean;
}): boolean {
  if (input.canModerate) return true;
  return input.status === 'PUBLISHED' ? input.sameUniversity : input.isOwner;
}

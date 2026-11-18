import { describe, expect, it } from 'vitest';

import { canUseCourseGuide } from './course-guide-access';

const membership = (
  role: string,
  verificationStatus = 'VERIFIED',
  endedAt: Date | null = null,
) => ({ role, verificationStatus, endedAt });

describe('canUseCourseGuide (rol matrisi, kart 457)', () => {
  it.each([
    ['doğrulanmış süren öğrenci', [membership('STUDENT')], true],
    ['öğrenci + mezun (ikisi de süren)', [membership('STUDENT'), membership('ALUMNI')], true],
    ['mezun', [membership('ALUMNI')], false],
    ['akademisyen', [membership('ACADEMIC')], false],
    ['onay bekleyen öğrenci', [membership('STUDENT', 'PENDING')], false],
    ['reddedilmiş öğrenci', [membership('STUDENT', 'REJECTED')], false],
    [
      'biten öğrencilik + süren mezunluk',
      [membership('STUDENT', 'VERIFIED', new Date()), membership('ALUMNI')],
      false,
    ],
    ['üyelik yok', [], false],
  ] as const)('%s → %s', (_name, memberships, expected) => {
    expect(canUseCourseGuide({ memberships: [...memberships] })).toBe(expected);
  });
});

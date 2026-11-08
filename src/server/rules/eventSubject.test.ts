import { describe, expect, it } from 'vitest';

import { PROFILE_THRESHOLDS } from '@/contracts/metrics';

import { crossedThresholds, pickEventSubject, type MembershipFacts } from './eventSubject';

const m = (
  role: MembershipFacts['role'],
  departmentId: string,
  patch: Partial<MembershipFacts> = {},
): MembershipFacts => ({
  role,
  departmentId,
  verificationStatus: 'VERIFIED',
  endedAt: null,
  ...patch,
});

describe('pickEventSubject', () => {
  it('üyelik yoksa null', () => {
    expect(pickEventSubject([])).toBeNull();
  });
  it('yalnız doğrulanmış ve kapanmamış üyelik sayılır', () => {
    expect(pickEventSubject([m('ALUMNI', 'd1', { verificationStatus: 'PENDING' })])).toBeNull();
    expect(pickEventSubject([m('ALUMNI', 'd1', { verificationStatus: 'REJECTED' })])).toBeNull();
    expect(pickEventSubject([m('ALUMNI', 'd1', { endedAt: new Date() })])).toBeNull();
    expect(
      pickEventSubject([m('STUDENT', 'd1', { verificationStatus: 'PENDING' }), m('STUDENT', 'd2')]),
    ).toEqual({ role: 'STUDENT', departmentId: 'd2' });
  });
  it('öncelik akademisyen > mezun > öğrenci; eşitlikte küçük bölüm kimliği; sıra sonucu değiştirmez', () => {
    const list = [m('STUDENT', 'a'), m('ALUMNI', 'z'), m('ACADEMIC', 'm'), m('ACADEMIC', 'b')];
    expect(pickEventSubject(list)).toEqual({ role: 'ACADEMIC', departmentId: 'b' });
    expect(pickEventSubject([...list].reverse())).toEqual({ role: 'ACADEMIC', departmentId: 'b' });
    expect(pickEventSubject([m('STUDENT', 'a'), m('ALUMNI', 'z')])).toEqual({
      role: 'ALUMNI',
      departmentId: 'z',
    });
  });
});

describe('crossedThresholds', () => {
  it.each([
    [0, 40, []],
    [0, 50, [50]],
    [49, 50, [50]],
    [50, 50, []],
    [50, 79, []],
    [40, 85, [50, 80]],
    [0, 100, [50, 80, 100]],
    [85, 60, []],
    [100, 100, []],
  ] as const)('%i → %i : %j', (before, after, expected) => {
    expect(crossedThresholds(before, after, PROFILE_THRESHOLDS)).toEqual([...expected]);
  });
});

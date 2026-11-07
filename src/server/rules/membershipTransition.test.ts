import { describe, expect, it } from 'vitest';

import {
  planAlumniTransition,
  type AlumniTransitionPlan,
  type TransitionMembership,
} from './membershipTransition';

const NOW = new Date('2026-11-07T12:00:00+03:00'); // akademik yıl 2026-27

const student = (overrides: Partial<TransitionMembership> = {}): TransitionMembership => ({
  id: 's1',
  role: 'STUDENT',
  verificationStatus: 'VERIFIED',
  entryYear: 2022,
  endedAt: null,
  ...overrides,
});
const alumni = (overrides: Partial<TransitionMembership> = {}): TransitionMembership => ({
  id: 'a1',
  role: 'ALUMNI',
  verificationStatus: 'PENDING',
  entryYear: 2022,
  endedAt: null,
  ...overrides,
});

describe('planAlumniTransition', () => {
  it.each<[string, TransitionMembership[], number, AlumniTransitionPlan]>([
    [
      'doğrulanmış öğrenci → mezun üyeliği eklenir, öğrenci kapanır',
      [student()],
      2026,
      {
        outcome: 'TRANSITION',
        endStudentMembershipId: 's1',
        entryYear: 2022,
        alumni: { action: 'CREATE' },
      },
    ],
    [
      'belge akışı: bekleyen mezun üyeliği doğrulanır',
      [student(), alumni()],
      2026,
      {
        outcome: 'TRANSITION',
        endStudentMembershipId: 's1',
        entryYear: 2022,
        alumni: { action: 'VERIFY_PENDING', membershipId: 'a1' },
      },
    ],
    [
      'yarım kalmış durum: mezun zaten doğrulanmış, öğrenci hâlâ etkin → yalnız öğrenci kapanır',
      [student(), alumni({ verificationStatus: 'VERIFIED' })],
      2026,
      {
        outcome: 'TRANSITION',
        endStudentMembershipId: 's1',
        entryYear: 2022,
        alumni: { action: 'KEEP_VERIFIED', membershipId: 'a1' },
      },
    ],
    [
      'geçiş zaten yapılmış (tekrar çağrı idempotent)',
      [student({ endedAt: new Date('2026-06-30') }), alumni({ verificationStatus: 'VERIFIED' })],
      2026,
      { outcome: 'ALREADY_TRANSITIONED', alumniMembershipId: 'a1' },
    ],
    [
      'giriş yılı bilinmeyen öğrenci geçebilir',
      [student({ entryYear: null })],
      2026,
      {
        outcome: 'TRANSITION',
        endStudentMembershipId: 's1',
        entryYear: null,
        alumni: { action: 'CREATE' },
      },
    ],
    [
      'mezuniyet yılı giriş yılına eşit olabilir (aynı yıl mezuniyet)',
      [student({ entryYear: 2026 })],
      2026,
      {
        outcome: 'TRANSITION',
        endStudentMembershipId: 's1',
        entryYear: 2026,
        alumni: { action: 'CREATE' },
      },
    ],
  ])('%s', (_label, memberships, graduationYear, expected) => {
    expect(planAlumniTransition(memberships, { graduationYear }, NOW)).toEqual(expected);
  });

  it.each<[string, TransitionMembership[], number, string]>([
    ['üyelik yok', [], 2026, 'NO_ACTIVE_STUDENT'],
    [
      'yalnız kapanmış öğrenci üyeliği',
      [student({ endedAt: new Date('2026-01-01') })],
      2026,
      'NO_ACTIVE_STUDENT',
    ],
    [
      'yalnız bekleyen mezun (öğrenci yok): bu yeni mezun yolu, geçiş değil',
      [alumni()],
      2026,
      'NO_ACTIVE_STUDENT',
    ],
    ['akademisyen geçişe giremez', [{ ...student(), role: 'ACADEMIC' }], 2026, 'NO_ACTIVE_STUDENT'],
    [
      'doğrulanmamış öğrenci',
      [student({ verificationStatus: 'PENDING' })],
      2026,
      'STUDENT_NOT_VERIFIED',
    ],
    [
      'reddedilmiş öğrenci',
      [student({ verificationStatus: 'REJECTED' })],
      2026,
      'STUDENT_NOT_VERIFIED',
    ],
    ['mezuniyet girişten önce', [student({ entryYear: 2022 })], 2021, 'GRADUATION_BEFORE_ENTRY'],
    ['mezuniyet yılı çok uzak gelecek', [student()], 2029, 'GRADUATION_TOO_FAR'],
    ['mezuniyet yılı tam sayı değil', [student()], 2026.5, 'GRADUATION_YEAR_INVALID'],
    ['mezuniyet yılı çok eski', [student({ entryYear: null })], 1900, 'GRADUATION_YEAR_INVALID'],
  ])('%s → %s', (_label, memberships, graduationYear, reason) => {
    expect(planAlumniTransition(memberships, { graduationYear }, NOW)).toEqual({
      outcome: 'INVALID',
      reason,
    });
  });

  it('üst sınır akademik yıla göredir: 2026-27' + "'de 2028'e kadar izin, 2029 değil", () => {
    expect(planAlumniTransition([student()], { graduationYear: 2028 }, NOW).outcome).toBe(
      'TRANSITION',
    );
    expect(planAlumniTransition([student()], { graduationYear: 2029 }, NOW).outcome).toBe(
      'INVALID',
    );
  });
});

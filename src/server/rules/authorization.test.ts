import { describe, expect, it } from 'vitest';

import {
  accountStatusOf,
  describeManagedScope,
  evaluateAccess,
  grantCovers,
  hasVerifiedMembership,
  type AccessRequest,
  type ActorFacts,
  type AdminTarget,
  type DenyReason,
  type DepartmentScope,
  type GrantFacts,
  type MembershipFacts,
} from './authorization';

// ---------------------------------------------------------------------------------------------
// Kapsam: iki fakülte, üç bölüm. A1 ve A2 aynı fakültede (fac-a); B1 başka fakültede (fac-b).
// ---------------------------------------------------------------------------------------------
const A1: DepartmentScope = { departmentId: 'dept-a1', facultyId: 'fac-a', universityId: 'uni' };
const A2: DepartmentScope = { departmentId: 'dept-a2', facultyId: 'fac-a', universityId: 'uni' };
const B1: DepartmentScope = { departmentId: 'dept-b1', facultyId: 'fac-b', universityId: 'uni' };

const membership = (
  overrides: Partial<MembershipFacts> & { departmentId?: string } = {},
): MembershipFacts => ({
  id: 'm',
  departmentId: A1.departmentId,
  role: 'STUDENT',
  verificationStatus: 'VERIFIED',
  endedAt: null,
  ...overrides,
});

const grant = (overrides: Partial<GrantFacts>): GrantFacts => ({
  id: 'g',
  scope: 'SYSTEM',
  facultyId: null,
  departmentId: null,
  revokedAt: null,
  ...overrides,
});

const facts = (overrides: Partial<ActorFacts> = {}): ActorFacts => ({
  accountStatus: 'ACTIVE',
  memberships: [membership()],
  grants: [],
  mentor: null,
  ...overrides,
});

// ---------------------------------------------------------------------------------------------
// docs/security.md “Yetkilendirme” matrisi — SÜTUNLAR (eylemler):
//   self   Kendi profili, CV, görünürlük
//   write  Deneyim yaz / taslak / moderasyona gönder
//   read   Yayınlanmış deneyim ve SSS okuma
//   dir    Mentor dizini; randevu, CV inceleme, iletişim talebi
//   ment   Müsaitlik, randevu onayı, CV incelemesi, SSS cevabı (mentor)
//   modA1  Moderasyon / mezun belgesi onayı / rol düzeltme / askıya alma — bölüm A1
//   modA2  … bölüm A2 (A1 ile aynı fakülte)
//   modB1  … bölüm B1 (başka fakülte)
//   repFA  Rapor, dışa aktarma, metrik — fakülte A geneli
//   repFB  … fakülte B geneli
//   sys    Puan kuralları, sözlükler, yönetici atama, şüphe kararı (yalnız sistem yöneticisi)
// SONUÇ kısaltmaları: + izin · U oturumsuz · S askıda · V doğrulanmamış üye · X yetkisiz
// ---------------------------------------------------------------------------------------------
const COLUMNS = [
  'self',
  'write',
  'read',
  'dir',
  'ment',
  'modA1',
  'modA2',
  'modB1',
  'repFA',
  'repFB',
  'sys',
] as const;
type Column = (typeof COLUMNS)[number];

const REQUESTS: Record<Column, AccessRequest> = {
  self: { action: 'selfProfile' },
  write: { action: 'experienceWrite' },
  read: { action: 'contentRead' },
  dir: { action: 'directoryUse' },
  ment: { action: 'mentorAct' },
  modA1: { action: 'adminScope', target: { kind: 'DEPARTMENT', department: A1 } },
  modA2: { action: 'adminScope', target: { kind: 'DEPARTMENT', department: A2 } },
  modB1: { action: 'adminScope', target: { kind: 'DEPARTMENT', department: B1 } },
  repFA: { action: 'adminScope', target: { kind: 'FACULTY', facultyId: 'fac-a' } },
  repFB: { action: 'adminScope', target: { kind: 'FACULTY', facultyId: 'fac-b' } },
  sys: { action: 'adminScope', target: { kind: 'SYSTEM' } },
};

const TOKEN_TO_DECISION: Record<string, 'ALLOW' | DenyReason> = {
  '+': 'ALLOW',
  U: 'UNAUTHENTICATED',
  S: 'SUSPENDED',
  V: 'NOT_VERIFIED',
  X: 'FORBIDDEN',
};

type Persona = { name: string; facts: ActorFacts | null; row: string };

const PERSONAS: readonly Persona[] = [
  //                                            self write read dir ment modA1 modA2 modB1 repFA repFB sys
  { name: 'oturumsuz', facts: null, row: 'U U U U U U U U U U U' },
  {
    name: 'silinmiş kullanıcı (oturum varmış gibi)',
    facts: facts({ accountStatus: 'DELETED' }),
    row: 'U U U U U U U U U U U',
  },
  {
    name: 'askıdaki doğrulanmış öğrenci',
    facts: facts({ accountStatus: 'SUSPENDED' }),
    row: 'S S S S S S S S S S S',
  },
  {
    name: 'askıdaki bölüm yöneticisi (kendi bölümünde yetkili olurdu)',
    facts: facts({
      accountStatus: 'SUSPENDED',
      grants: [grant({ scope: 'DEPARTMENT', departmentId: A1.departmentId })],
    }),
    row: 'S S S S S S S S S S S',
  },
  {
    name: 'askıdaki sistem yöneticisi',
    facts: facts({ accountStatus: 'SUSPENDED', grants: [grant({ scope: 'SYSTEM' })] }),
    row: 'S S S S S S S S S S S',
  },
  {
    name: 'doğrulanmamış mezun (belge bekliyor)',
    facts: facts({
      memberships: [membership({ role: 'ALUMNI', verificationStatus: 'PENDING' })],
    }),
    row: '+ V V V V X X X X X X',
  },
  {
    name: 'reddedilmiş mezun',
    facts: facts({
      memberships: [membership({ role: 'ALUMNI', verificationStatus: 'REJECTED' })],
    }),
    row: '+ V V V V X X X X X X',
  },
  {
    name: 'üyeliği kapanmış eski öğrenci (başka üyeliği yok)',
    facts: facts({ memberships: [membership({ endedAt: new Date('2026-06-30') })] }),
    row: '+ V V V V X X X X X X',
  },
  {
    name: 'üyeliği olmayan kullanıcı',
    facts: facts({ memberships: [] }),
    row: '+ V V V V X X X X X X',
  },
  { name: 'doğrulanmış öğrenci', facts: facts(), row: '+ + + + X X X X X X X' },
  {
    name: 'üst sınıf mentor (öğrenci + etkin mentor profili)',
    facts: facts({ mentor: { isActive: true } }),
    row: '+ + + + + X X X X X X',
  },
  {
    name: 'mentor profili kapalı öğrenci',
    facts: facts({ mentor: { isActive: false } }),
    row: '+ + + + X X X X X X X',
  },
  {
    name: 'mezun mentor',
    facts: facts({
      memberships: [membership({ role: 'ALUMNI' })],
      mentor: { isActive: true },
    }),
    row: '+ + + + + X X X X X X',
  },
  {
    name: 'doğrulanmamış üye ama etkin mentor profili var',
    facts: facts({
      memberships: [membership({ role: 'ALUMNI', verificationStatus: 'PENDING' })],
      mentor: { isActive: true },
    }),
    row: '+ V V V V X X X X X X',
  },
  {
    name: 'doğrulanmış akademisyen (yetkisiz)',
    facts: facts({ memberships: [membership({ role: 'ACADEMIC' })] }),
    row: '+ + + + X X X X X X X',
  },
  {
    name: 'bölüm yöneticisi (A1)',
    facts: facts({
      memberships: [membership({ role: 'ACADEMIC' })],
      grants: [grant({ scope: 'DEPARTMENT', departmentId: A1.departmentId })],
    }),
    row: '+ + + + X + X X X X X',
  },
  {
    name: 'bölüm yöneticisi (A2) — başka bölümün yöneticisi',
    facts: facts({
      memberships: [membership({ role: 'ACADEMIC', departmentId: A2.departmentId })],
      grants: [grant({ scope: 'DEPARTMENT', departmentId: A2.departmentId })],
    }),
    row: '+ + + + X X + X X X X',
  },
  {
    name: 'bölüm yöneticisi (B1) — başka fakültenin yöneticisi',
    facts: facts({
      memberships: [membership({ role: 'ACADEMIC', departmentId: B1.departmentId })],
      grants: [grant({ scope: 'DEPARTMENT', departmentId: B1.departmentId })],
    }),
    row: '+ + + + X X X + X X X',
  },
  {
    name: 'bölüm yöneticisi (A1) ama üyeliği doğrulanmamış',
    facts: facts({
      memberships: [membership({ role: 'ACADEMIC', verificationStatus: 'PENDING' })],
      grants: [grant({ scope: 'DEPARTMENT', departmentId: A1.departmentId })],
    }),
    row: '+ V V V V V X X X X X',
  },
  {
    name: 'yetkisi kaldırılmış bölüm yöneticisi',
    facts: facts({
      memberships: [membership({ role: 'ACADEMIC' })],
      grants: [
        grant({
          scope: 'DEPARTMENT',
          departmentId: A1.departmentId,
          revokedAt: new Date('2026-10-01'),
        }),
      ],
    }),
    row: '+ + + + X X X X X X X',
  },
  {
    name: 'bölümü boş (bozuk) DEPARTMENT yetkisi',
    facts: facts({ grants: [grant({ scope: 'DEPARTMENT', departmentId: null })] }),
    row: '+ + + + X X X X X X X',
  },
  {
    name: 'fakültesi boş (bozuk) FACULTY yetkisi',
    facts: facts({ grants: [grant({ scope: 'FACULTY', facultyId: null })] }),
    row: '+ + + + X X X X X X X',
  },
  {
    name: 'fakülte yöneticisi (A)',
    facts: facts({
      memberships: [membership({ role: 'ACADEMIC' })],
      grants: [grant({ scope: 'FACULTY', facultyId: 'fac-a' })],
    }),
    row: '+ + + + X + + X + X X',
  },
  {
    name: 'fakülte yöneticisi (B)',
    facts: facts({
      memberships: [membership({ role: 'ACADEMIC', departmentId: B1.departmentId })],
      grants: [grant({ scope: 'FACULTY', facultyId: 'fac-b' })],
    }),
    row: '+ + + + X X X + X + X',
  },
  {
    name: 'sistem yöneticisi',
    facts: facts({
      memberships: [membership({ role: 'ACADEMIC' })],
      grants: [grant({ scope: 'SYSTEM' })],
    }),
    row: '+ + + + X + + + + + +',
  },
  {
    name: 'sistem yetkisi var ama üyeliği yok',
    facts: facts({ memberships: [], grants: [grant({ scope: 'SYSTEM' })] }),
    row: '+ V V V V V V V V V V',
  },
  {
    name: 'iki yetkisi olan (A1 bölüm + B fakülte)',
    facts: facts({
      memberships: [membership({ role: 'ACADEMIC' })],
      grants: [
        grant({ id: 'g1', scope: 'DEPARTMENT', departmentId: A1.departmentId }),
        grant({ id: 'g2', scope: 'FACULTY', facultyId: 'fac-b' }),
      ],
    }),
    row: '+ + + + X + X + X + X',
  },
];

describe('yetki matrisi (docs/security.md) — tablo-güdümlü', () => {
  const cases = PERSONAS.flatMap((persona) => {
    const tokens = persona.row.split(' ');
    return COLUMNS.map((column, index) => ({
      persona,
      column,
      expected: TOKEN_TO_DECISION[tokens[index] ?? ''],
    }));
  });

  it('her satır sütun sayısı kadar sonuç taşır', () => {
    for (const persona of PERSONAS) {
      expect(persona.row.split(' ').length, persona.name).toBe(COLUMNS.length);
    }
  });

  it.each(cases)('$persona.name · $column → $expected', ({ persona, column, expected }) => {
    const decision = evaluateAccess(persona.facts, REQUESTS[column]);
    if (expected === 'ALLOW') {
      expect(decision).toEqual({ allowed: true });
    } else {
      expect(decision).toEqual({ allowed: false, reason: expected });
    }
  });
});

describe('accountStatusOf', () => {
  const now = new Date('2026-11-07T12:00:00Z');
  const user = { banned: false, banExpires: null, deletedAt: null };

  it.each([
    ['sağlam hesap', user, 'ACTIVE'],
    ['süresiz askı', { ...user, banned: true }, 'SUSPENDED'],
    [
      'süreli askı sürüyor',
      { ...user, banned: true, banExpires: new Date('2026-12-01') },
      'SUSPENDED',
    ],
    ['süreli askı bitti', { ...user, banned: true, banExpires: new Date('2026-11-01') }, 'ACTIVE'],
    ['askı tam şimdi bitiyor', { ...user, banned: true, banExpires: now }, 'ACTIVE'],
    ['süre var ama askı bayrağı yok', { ...user, banExpires: new Date('2026-12-01') }, 'ACTIVE'],
    ['silinmiş', { ...user, deletedAt: new Date('2026-10-01') }, 'DELETED'],
    [
      'hem askıda hem silinmiş: silinmiş öncelikli',
      { banned: true, banExpires: null, deletedAt: new Date('2026-10-01') },
      'DELETED',
    ],
  ] as const)('%s → %s', (_label, input, expected) => {
    expect(accountStatusOf(input, now)).toBe(expected);
  });
});

describe('kapsam çözümleme: grantCovers', () => {
  const dept = (department: DepartmentScope): AdminTarget => ({ kind: 'DEPARTMENT', department });

  it.each([
    // [yetki, hedef, beklenen]
    ['SYSTEM → bölüm', grant({ scope: 'SYSTEM' }), dept(B1), true],
    ['SYSTEM → fakülte', grant({ scope: 'SYSTEM' }), { kind: 'FACULTY', facultyId: 'fac-b' }, true],
    ['SYSTEM → sistem', grant({ scope: 'SYSTEM' }), { kind: 'SYSTEM' }, true],
    [
      'FACULTY → kendi fakültesinin bölümü',
      grant({ scope: 'FACULTY', facultyId: 'fac-a' }),
      dept(A2),
      true,
    ],
    [
      'FACULTY → başka fakültenin bölümü',
      grant({ scope: 'FACULTY', facultyId: 'fac-a' }),
      dept(B1),
      false,
    ],
    [
      'FACULTY → kendi fakültesi',
      grant({ scope: 'FACULTY', facultyId: 'fac-a' }),
      { kind: 'FACULTY', facultyId: 'fac-a' },
      true,
    ],
    [
      'FACULTY → başka fakülte',
      grant({ scope: 'FACULTY', facultyId: 'fac-a' }),
      { kind: 'FACULTY', facultyId: 'fac-b' },
      false,
    ],
    [
      'FACULTY → sistem (yukarıyı kapsamaz)',
      grant({ scope: 'FACULTY', facultyId: 'fac-a' }),
      { kind: 'SYSTEM' },
      false,
    ],
    [
      'DEPARTMENT → kendi bölümü',
      grant({ scope: 'DEPARTMENT', departmentId: 'dept-a1' }),
      dept(A1),
      true,
    ],
    [
      'DEPARTMENT → aynı fakültedeki başka bölüm',
      grant({ scope: 'DEPARTMENT', departmentId: 'dept-a1' }),
      dept(A2),
      false,
    ],
    [
      'DEPARTMENT → fakülte (yukarıyı kapsamaz)',
      grant({ scope: 'DEPARTMENT', departmentId: 'dept-a1' }),
      { kind: 'FACULTY', facultyId: 'fac-a' },
      false,
    ],
    [
      'DEPARTMENT → sistem',
      grant({ scope: 'DEPARTMENT', departmentId: 'dept-a1' }),
      { kind: 'SYSTEM' },
      false,
    ],
    [
      'kaldırılmış SYSTEM',
      grant({ scope: 'SYSTEM', revokedAt: new Date('2026-01-01') }),
      dept(A1),
      false,
    ],
    ['FACULTY facultyId boş', grant({ scope: 'FACULTY', facultyId: null }), dept(A1), false],
    [
      'FACULTY yetkisi başka bir kimlikle karıştırılamaz (bölüm kimliği ≠ fakülte kimliği)',
      grant({ scope: 'FACULTY', facultyId: 'dept-a1' }),
      dept(A1),
      false,
    ],
    [
      'DEPARTMENT yetkisi fakülte kimliğiyle eşleşmez',
      grant({ scope: 'DEPARTMENT', departmentId: 'fac-a' }),
      dept(A1),
      false,
    ],
  ] as const)('%s → %s', (_label, input, target, expected) => {
    expect(grantCovers(input, target)).toBe(expected);
  });
});

describe('describeManagedScope (kuyruk/liste süzgeci)', () => {
  it('yalnız etkin yetkileri özetler, tekrarları atar', () => {
    const scope = describeManagedScope([
      grant({ id: '1', scope: 'FACULTY', facultyId: 'fac-a' }),
      grant({ id: '2', scope: 'FACULTY', facultyId: 'fac-a' }),
      grant({ id: '3', scope: 'DEPARTMENT', departmentId: 'dept-b1' }),
      grant({
        id: '4',
        scope: 'DEPARTMENT',
        departmentId: 'dept-a2',
        revokedAt: new Date('2026-01-01'),
      }),
    ]);
    expect(scope).toEqual({ system: false, facultyIds: ['fac-a'], departmentIds: ['dept-b1'] });
  });

  it('sistem yetkisi system:true verir; yetkisiz kullanıcı hiçbir şey yönetmez', () => {
    expect(describeManagedScope([grant({ scope: 'SYSTEM' })]).system).toBe(true);
    expect(describeManagedScope([])).toEqual({ system: false, facultyIds: [], departmentIds: [] });
  });
});

describe('hasVerifiedMembership', () => {
  it('çoklu rolde bir doğrulanmış etkin üyelik yeter', () => {
    expect(
      hasVerifiedMembership(
        facts({
          memberships: [
            membership({ id: 'old', endedAt: new Date('2026-01-01') }),
            membership({ id: 'pending', role: 'ALUMNI', verificationStatus: 'PENDING' }),
            membership({ id: 'ok', departmentId: B1.departmentId, role: 'ACADEMIC' }),
          ],
        }),
      ),
    ).toBe(true);
  });

  it('doğrulanmış ama kapanmış üyelik yetmez', () => {
    expect(
      hasVerifiedMembership(
        facts({ memberships: [membership({ endedAt: new Date('2026-01-01') })] }),
      ),
    ).toBe(false);
  });
});

describe('adminAny (panele giriş) — tablo-güdümlü', () => {
  const REQUEST: AccessRequest = { action: 'adminAny' };
  const at = new Date('2026-01-01');
  const cases: [string, ActorFacts | null, 'ALLOW' | DenyReason][] = [
    ['oturumsuz', null, 'UNAUTHENTICATED'],
    ['silinmiş', facts({ accountStatus: 'DELETED' }), 'UNAUTHENTICATED'],
    [
      'askıdaki sistem yöneticisi',
      facts({ accountStatus: 'SUSPENDED', grants: [grant({ scope: 'SYSTEM' })] }),
      'SUSPENDED',
    ],
    ['yetkisiz doğrulanmış öğrenci', facts(), 'FORBIDDEN'],
    [
      'bölüm yöneticisi',
      facts({ grants: [grant({ scope: 'DEPARTMENT', departmentId: A1.departmentId })] }),
      'ALLOW',
    ],
    [
      'fakülte yöneticisi',
      facts({ grants: [grant({ scope: 'FACULTY', facultyId: 'fac-a' })] }),
      'ALLOW',
    ],
    ['sistem yöneticisi', facts({ grants: [grant({ scope: 'SYSTEM' })] }), 'ALLOW'],
    [
      'kaldırılmış yetki',
      facts({ grants: [grant({ scope: 'SYSTEM', revokedAt: at })] }),
      'FORBIDDEN',
    ],
    [
      'bozuk yetki (bölüm kimliği yok)',
      facts({ grants: [grant({ scope: 'DEPARTMENT', departmentId: null })] }),
      'FORBIDDEN',
    ],
    [
      'bozuk yetki (fakülte kimliği yok)',
      facts({ grants: [grant({ scope: 'FACULTY', facultyId: null })] }),
      'FORBIDDEN',
    ],
    [
      'yetkili ama doğrulanmış üyeliği yok',
      facts({ memberships: [], grants: [grant({ scope: 'SYSTEM' })] }),
      'NOT_VERIFIED',
    ],
    [
      'yetkili ama üyeliği bekliyor',
      facts({
        memberships: [membership({ verificationStatus: 'PENDING' })],
        grants: [grant({ scope: 'SYSTEM' })],
      }),
      'NOT_VERIFIED',
    ],
    [
      'yetkili ama üyeliği kapanmış',
      facts({ memberships: [membership({ endedAt: at })], grants: [grant({ scope: 'SYSTEM' })] }),
      'NOT_VERIFIED',
    ],
    ['yetkisiz ve üyeliksiz: doğrulama durumu sızmaz', facts({ memberships: [] }), 'FORBIDDEN'],
  ];

  it.each(cases)('%s → %s', (_name, actorFacts, expected) => {
    const decision = evaluateAccess(actorFacts, REQUEST);
    expect(decision.allowed ? 'ALLOW' : decision.reason).toBe(expected);
  });
});

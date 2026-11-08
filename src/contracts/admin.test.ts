import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ERROR_CODES } from '@/lib/errors';

import {
  ADMIN_ACTION_ACCESS,
  ADMIN_ACTION_ERRORS,
  ADMIN_PAGE_SIZE_DEFAULT,
  ADMIN_PAGE_SIZE_MAX,
  AUDIT_ACTION_NAMES,
  AUDIT_TARGET_TYPE_NAMES,
  EMPLOYMENT_EXPORT_HREF,
  EMPLOYMENT_EXPORT_SHEETS,
  REPORT_MIN_GROUP_SIZE,
  adminOverviewSchema,
  adminReportPageSchema,
  auditLogPageSchema,
  createDictionaryEntrySchema,
  dictionaryEntryPageSchema,
  employmentExportHref,
  employmentReportFilterSchema,
  employmentReportSchema,
  listAdminReportsSchema,
  listAuditLogSchema,
  listDictionaryEntriesSchema,
  listUnmatchedValuesSchema,
  resolveUnmatchedValueSchema,
  unmatchedValuePageSchema,
  updateDictionaryEntrySchema,
} from './admin';
import {
  ADMIN_USER_ACTION_ERRORS,
  adminGrantPageSchema,
  adminUserDetailSchema,
  adminUserPageSchema,
  correctMembershipSchema,
  getUserDetailSchema,
  grantAdminSchema,
  listAdminGrantsSchema,
  revokeAdminSchema,
  searchUsersSchema,
  suspendUserSchema,
  suspendUserOutputSchema,
  unsuspendUserSchema,
} from './admin-users';
import { ADMIN_ACTIONS, AUDIT_TARGET_TYPES } from '../server/rules/adminAudit';

const ok = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('erişim tablosu', () => {
  it('sistem yöneticisine özel eylemler güvenlik matrisindeki son satırdır', () => {
    const systemOnly = Object.entries(ADMIN_ACTION_ACCESS)
      .filter(([, level]) => level === 'SYSTEM_ONLY')
      .map(([name]) => name)
      .sort();
    expect(systemOnly).toEqual(
      [
        'createDictionaryEntry',
        'deleteDictionaryEntry',
        'grantAdmin',
        'listAdminGrants',
        'listAuditLog',
        'listDictionaryEntries',
        'listUnmatchedValues',
        'resolveUnmatchedValue',
        'revokeAdmin',
        'updateDictionaryEntry',
      ].sort(),
    );
  });

  it('kullanıcı yönetimi ve rapor eylemleri her kapsamdaki yöneticiye açıktır (veri kapsamla süzülür)', () => {
    for (const name of [
      'getAdminOverview',
      'listAdminReports',
      'getEmploymentReport',
      'searchUsers',
      'getUserDetail',
      'suspendUser',
      'unsuspendUser',
      'correctMembership',
    ] as const) {
      expect(ADMIN_ACTION_ACCESS[name]).toBe('ANY_ADMIN');
    }
  });

  it('her eylemin hata kodu kaydı vardır, kodlar kayıtlıdır ve tablo ile birebir örtüşür', () => {
    const errorMaps = { ...ADMIN_ACTION_ERRORS, ...ADMIN_USER_ACTION_ERRORS };
    expect(Object.keys(errorMaps).sort()).toEqual(Object.keys(ADMIN_ACTION_ACCESS).sort());
    const registered = new Set<string>(ERROR_CODES);
    for (const [name, codes] of Object.entries(errorMaps)) {
      for (const code of codes) expect(registered.has(code), `${name}: ${code}`).toBe(true);
      expect(codes as readonly string[], name).toContain('AUTH_FORBIDDEN');
    }
  });

  it('gerekçesi zorunlu eylemler gerekçe hata kodlarını açıkça listeler', () => {
    for (const name of ['suspendUser', 'correctMembership', 'revokeAdmin'] as const) {
      expect(ADMIN_USER_ACTION_ERRORS[name]).toContain('AUDIT_REASON_REQUIRED');
    }
  });
});

describe('işlem kaydı eşitliği (sözleşme sunucu koduna bağlanmaz, test korur)', () => {
  it('eylem ve hedef türü adları rules/adminAudit ile aynıdır', () => {
    expect([...AUDIT_ACTION_NAMES].sort()).toEqual(Object.keys(ADMIN_ACTIONS).sort());
    expect([...AUDIT_TARGET_TYPE_NAMES].sort()).toEqual([...AUDIT_TARGET_TYPES].sort());
  });
});

/** Çıktı şemasındaki bütün alan adlarını (iç içe) toplar. */
function fieldNames(schema: z.ZodType): string[] {
  const names: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.properties && typeof record.properties === 'object') {
      for (const [key, value] of Object.entries(record.properties)) {
        names.push(key);
        walk(value);
      }
    }
    for (const [key, value] of Object.entries(record)) if (key !== 'properties') walk(value);
  };
  walk(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }));
  return names;
}

describe('çıktı şemalarında kişisel veri', () => {
  const outputs = {
    adminOverviewSchema,
    adminReportPageSchema,
    dictionaryEntryPageSchema,
    unmatchedValuePageSchema,
    auditLogPageSchema,
    employmentReportSchema,
    adminUserPageSchema,
    adminUserDetailSchema,
    adminGrantPageSchema,
    suspendUserOutputSchema,
  };
  const FORBIDDEN = [
    'email',
    'phone',
    'telefon',
    'eposta',
    'password',
    'token',
    'secret',
    'ipAddress',
    'userAgent',
    'authorId',
    'reporterId',
    'reviewedById',
    'moderatedById',
    'storageKey',
  ];

  it.each(Object.entries(outputs))(
    '%s ham e-posta/telefon ya da gizli kimlik alanı taşımaz',
    (_name, schema) => {
      const names = fieldNames(schema as z.ZodType);
      expect(names.length).toBeGreaterThan(0);
      for (const forbidden of FORBIDDEN) {
        expect(
          names.map((n) => n.toLowerCase()),
          forbidden,
        ).not.toContain(forbidden.toLowerCase());
      }
    },
  );

  it('e-posta ve telefon yalnız maskeli adlarla görünür', () => {
    const names = [...fieldNames(adminUserPageSchema), ...fieldNames(adminGrantPageSchema)];
    expect(names).toContain('maskedEmail');
    expect(names).toContain('maskedPhone');
    for (const name of names) {
      if (/mail|phone/i.test(name)) expect(name).toMatch(/^masked/);
    }
  });

  it('kullanıcı çıktısına ham e-posta eklenemez (katı şema)', () => {
    const summary = {
      id: 'u',
      displayName: 'Ad',
      maskedEmail: 'a***@b***.com',
      maskedPhone: null,
      status: 'ACTIVE',
      memberships: [],
      isAdmin: false,
      mentorActive: false,
      manageable: true,
    };
    expect(ok(adminUserPageSchema, { items: [summary], nextCursor: null })).toBe(true);
    expect(
      ok(adminUserPageSchema, { items: [{ ...summary, email: 'a@b.com' }], nextCursor: null }),
    ).toBe(false);
  });

  it('şikâyet çıktısı raportör, yazar ve moderatör kimliği taşımaz', () => {
    const item = {
      id: 'r',
      status: 'OPEN',
      reason: 'Uygunsuz',
      createdAt: new Date(),
      reviewedAt: null,
      resolutionNote: null,
      target: {
        type: 'EXPERIENCE',
        id: 'e',
        experienceType: 'INTERNSHIP',
        organizationName: 'X',
        isAnonymous: true,
        departmentId: 'd',
        departmentName: 'Bölüm',
        openReportCount: 1,
      },
    };
    expect(ok(adminReportPageSchema, { items: [item], nextCursor: null })).toBe(true);
    for (const extra of ['authorId', 'reporterId', 'reviewedById']) {
      expect(
        ok(adminReportPageSchema, { items: [{ ...item, [extra]: 'x' }], nextCursor: null }),
      ).toBe(false);
      expect(
        ok(adminReportPageSchema, {
          items: [{ ...item, target: { ...item.target, [extra]: 'x' } }],
          nextCursor: null,
        }),
      ).toBe(false);
    }
  });
});

describe('girdi şemaları katıdır ve kimlik/rol/kapsam alanı kabul etmez', () => {
  const inputs: [string, { safeParse: (v: unknown) => { success: boolean } }, unknown][] = [
    ['listAdminReports', listAdminReportsSchema, {}],
    ['listDictionaryEntries', listDictionaryEntriesSchema, { kind: 'COMPANY' }],
    ['listUnmatchedValues', listUnmatchedValuesSchema, {}],
    ['listAuditLog', listAuditLogSchema, {}],
    ['employmentReport', employmentReportFilterSchema, {}],
    ['searchUsers', searchUsersSchema, {}],
    ['getUserDetail', getUserDetailSchema, { userId: 'u' }],
    ['suspendUser', suspendUserSchema, { userId: 'u', reason: 'Kural ihlali' }],
    ['unsuspendUser', unsuspendUserSchema, { userId: 'u' }],
    ['revokeAdmin', revokeAdminSchema, { grantId: 'g', reason: 'Görev bitti' }],
    ['listAdminGrants', listAdminGrantsSchema, {}],
  ];

  it.each(inputs)(
    '%s geçerli girdiyi kabul eder, bilinmeyen alanı reddeder',
    (name, schema, valid) => {
      expect(ok(schema, valid)).toBe(true);
      // `listAuditLog.actorId` bir SÜZGEÇTİR (kimin yaptığına göre ara), kimlik beyanı değildir.
      const extras = ['role', 'actorId', 'scope', 'isAdmin', 'adminScope', 'departmentIds'].filter(
        (extra) => !(name === 'listAuditLog' && extra === 'actorId'),
      );
      for (const extra of extras) {
        expect(ok(schema, { ...(valid as object), [extra]: 'ADMIN' }), extra).toBe(false);
      }
    },
  );

  it('sayfa boyutu varsayılan 20, üst sınır 50', () => {
    expect(listAuditLogSchema.parse({}).limit).toBe(ADMIN_PAGE_SIZE_DEFAULT);
    expect(ok(listAuditLogSchema, { limit: ADMIN_PAGE_SIZE_MAX })).toBe(true);
    expect(ok(listAuditLogSchema, { limit: ADMIN_PAGE_SIZE_MAX + 1 })).toBe(false);
    expect(ok(listAuditLogSchema, { limit: 0 })).toBe(false);
    expect(ok(searchUsersSchema, { limit: 1.5 })).toBe(false);
  });

  it('arama metni en az 2 karakter', () => {
    expect(ok(searchUsersSchema, { query: 'a' })).toBe(false);
    expect(ok(searchUsersSchema, { query: ' a ' })).toBe(false);
    expect(ok(searchUsersSchema, { query: 'ay' })).toBe(true);
    expect(ok(searchUsersSchema, { query: 'x'.repeat(101) })).toBe(false);
  });
});

describe('sözlük ve eşleşmeyen değer girdileri', () => {
  it('sektör bağı yalnız şirkette anlamlıdır', () => {
    expect(ok(createDictionaryEntrySchema, { kind: 'COMPANY', name: 'Acme', sectorId: 's' })).toBe(
      true,
    );
    expect(ok(createDictionaryEntrySchema, { kind: 'TITLE', name: 'Analist', sectorId: 's' })).toBe(
      false,
    );
    expect(ok(createDictionaryEntrySchema, { kind: 'SKILL', name: 'SQL' })).toBe(true);
    expect(ok(createDictionaryEntrySchema, { kind: 'PERSON', name: 'SQL' })).toBe(false);
  });

  it('ad 2–200 karakter; takma ad en fazla 20', () => {
    expect(ok(createDictionaryEntrySchema, { kind: 'SKILL', name: 'a' })).toBe(false);
    expect(ok(createDictionaryEntrySchema, { kind: 'SKILL', name: 'a'.repeat(201) })).toBe(false);
    expect(
      ok(createDictionaryEntrySchema, {
        kind: 'SKILL',
        name: 'SQL',
        aliases: Array.from({ length: 21 }, (_, i) => `takma ${i}`),
      }),
    ).toBe(false);
    expect(createDictionaryEntrySchema.parse({ kind: 'SKILL', name: ' SQL ' }).aliases).toEqual([]);
  });

  it('güncellemede en az bir alan gerekir; sektör bağı null ile kaldırılır', () => {
    expect(ok(updateDictionaryEntrySchema, { kind: 'COMPANY', id: 'x' })).toBe(false);
    expect(ok(updateDictionaryEntrySchema, { kind: 'COMPANY', id: 'x', sectorId: null })).toBe(
      true,
    );
    expect(ok(updateDictionaryEntrySchema, { kind: 'TITLE', id: 'x', sectorId: null })).toBe(false);
    expect(ok(updateDictionaryEntrySchema, { kind: 'TITLE', id: 'x', name: 'Yeni ad' })).toBe(true);
  });

  it('çözüm türleri ayrı ayrı doğrulanır', () => {
    const resolve = (resolution: unknown) =>
      ok(resolveUnmatchedValueSchema, { id: 'v', resolution });
    expect(resolve({ type: 'LINK', entryId: 'e' })).toBe(true);
    expect(resolve({ type: 'LINK' })).toBe(false);
    expect(resolve({ type: 'CREATE', name: 'Yeni Şirket', sectorId: 's' })).toBe(true);
    expect(resolve({ type: 'CREATE' })).toBe(false);
    expect(resolve({ type: 'DISMISS' })).toBe(true);
    expect(resolve({ type: 'DISMISS', entryId: 'e' })).toBe(false);
    expect(resolve({ type: 'DELETE' })).toBe(false);
  });
});

describe('işlem kaydı süzgeci', () => {
  it('tarihler metin olarak da gelir (sunucu eylemi serileştirmesi); başlangıç bitişten sonra olamaz', () => {
    const parsed = listAuditLogSchema.parse({
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
    });
    expect(parsed.from).toBeInstanceOf(Date);
    expect(ok(listAuditLogSchema, { from: '2026-03-01', to: '2026-02-01' })).toBe(false);
    expect(ok(listAuditLogSchema, { from: 'dün' })).toBe(false);
  });

  it('eylem ve hedef türü bilinmeyen değer reddedilir', () => {
    expect(ok(listAuditLogSchema, { action: 'USER_SUSPEND' })).toBe(true);
    expect(ok(listAuditLogSchema, { action: 'DROP_TABLE' })).toBe(false);
    expect(ok(listAuditLogSchema, { targetType: 'EMPLOYMENT_REPORT' })).toBe(true);
    expect(ok(listAuditLogSchema, { targetType: 'PASSWORD' })).toBe(false);
  });
});

describe('mezun istihdam raporu ve Excel', () => {
  it('süzgeç: bölüm ve fakülte birlikte verilemez; yıl aralığı sıralı olmalı', () => {
    expect(ok(employmentReportFilterSchema, { departmentId: 'd', facultyId: 'f' })).toBe(false);
    expect(
      ok(employmentReportFilterSchema, {
        facultyId: 'f',
        graduationYearFrom: 2018,
        graduationYearTo: 2024,
      }),
    ).toBe(true);
    expect(
      ok(employmentReportFilterSchema, { graduationYearFrom: 2025, graduationYearTo: 2020 }),
    ).toBe(false);
    expect(ok(employmentReportFilterSchema, { graduationYearFrom: 1949 })).toBe(false);
    expect(ok(employmentReportFilterSchema, { graduationYearTo: 2101 })).toBe(false);
  });

  it('küçük hücre eşiği: eşiğin altındaki kova çıktıda geçersizdir', () => {
    const report = (count: number) => ({
      generatedAt: new Date(),
      minGroupSize: REPORT_MIN_GROUP_SIZE,
      totalAlumni: 10,
      alumniWithPosition: 8,
      distributions: {
        SECTOR: [{ type: 'NAMED', label: 'Bilişim', count }],
        TITLE: [],
        COMPANY: [],
      },
    });
    expect(ok(employmentReportSchema, report(REPORT_MIN_GROUP_SIZE))).toBe(true);
    expect(ok(employmentReportSchema, report(REPORT_MIN_GROUP_SIZE - 1))).toBe(false);
    expect(ok(employmentReportSchema, report(1))).toBe(false);
  });

  it('Excel sayfaları yalnız toplu sütunlar taşır: kişi, e-posta, telefon sütunu yok', () => {
    const columns = EMPLOYMENT_EXPORT_SHEETS.flatMap((sheet) => [...sheet.columns]);
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) {
      expect(column.toLocaleLowerCase('tr-TR')).not.toMatch(
        /ad soyad|e-?posta|telefon|kişi|kullanıcı|kimlik|linkedin/,
      );
    }
    expect(EMPLOYMENT_EXPORT_SHEETS.map((sheet) => sheet.name)).toEqual([
      'Özet',
      'Sektör',
      'Unvan',
      'Şirket',
    ]);
  });

  it('dışa aktarma bağlantısı yalnız tanımlı süzgeçleri taşır', () => {
    expect(employmentExportHref()).toBe(EMPLOYMENT_EXPORT_HREF);
    expect(employmentExportHref({ departmentId: 'd1', graduationYearFrom: 2020 })).toBe(
      `${EMPLOYMENT_EXPORT_HREF}?departmentId=d1&graduationYearFrom=2020`,
    );
  });
});

describe('genel bakış', () => {
  it('sistem dışı yöneticide eşleşmeyen değer sayısı null olabilir', () => {
    const overview = {
      level: 'DEPARTMENT',
      departments: [{ id: 'd', name: 'Bölüm', facultyId: 'f', facultyName: 'Fakülte' }],
      capabilities: {
        users: true,
        reports: true,
        employmentReport: true,
        dictionaries: false,
        unmatchedValues: false,
        adminGrants: false,
        auditLog: false,
      },
      counts: {
        pendingGraduationDocuments: 1,
        pendingExperiences: 2,
        openReports: 0,
        suspendedUsers: 0,
        openUnmatchedValues: null,
      },
    };
    expect(ok(adminOverviewSchema, overview)).toBe(true);
    expect(ok(adminOverviewSchema, { ...overview, level: 'ROOT' })).toBe(false);
  });
});

describe('askıya alma girdisi', () => {
  const base = { userId: 'u', reason: 'Kurallara aykırı davranış' };
  const days = (n: number) => new Date(Date.now() + n * 86_400_000);

  it('gerekçe zorunlu (3–1000 karakter)', () => {
    expect(ok(suspendUserSchema, { userId: 'u' })).toBe(false);
    expect(ok(suspendUserSchema, { userId: 'u', reason: 'ab' })).toBe(false);
    expect(ok(suspendUserSchema, { userId: 'u', reason: 'x'.repeat(1001) })).toBe(false);
    expect(ok(suspendUserSchema, { ...base, reason: 'x'.repeat(1000) })).toBe(true);
  });

  it('süre: yok (süresiz), gelecekte ve en fazla 365 gün', () => {
    expect(ok(suspendUserSchema, base)).toBe(true);
    expect(ok(suspendUserSchema, { ...base, expiresAt: days(30) })).toBe(true);
    expect(ok(suspendUserSchema, { ...base, expiresAt: days(364) })).toBe(true);
    expect(ok(suspendUserSchema, { ...base, expiresAt: days(-1) })).toBe(false);
    expect(ok(suspendUserSchema, { ...base, expiresAt: days(366) })).toBe(false);
    expect(ok(suspendUserSchema, { ...base, expiresAt: 'yarın' })).toBe(false);
  });
});

describe('üyelik düzeltme ve yönetici atama girdisi', () => {
  it('düzeltmede gerekçe ve en az bir değişiklik şart; yıl sınırları', () => {
    const change = (
      changes: unknown,
      input: { reason?: unknown } = { reason: 'Yanlış bölüm beyanı' },
    ) => ok(correctMembershipSchema, { membershipId: 'm', ...input, changes });
    expect(change({ departmentId: 'd' })).toBe(true);
    expect(change({ role: 'ALUMNI', graduationYear: 2024 })).toBe(true);
    expect(change({})).toBe(false);
    expect(change({ entryYear: undefined })).toBe(false);
    expect(change({ departmentId: 'd' }, {})).toBe(false);
    expect(change({ departmentId: 'd' }, { reason: 'ab' })).toBe(false);
    expect(change({ role: 'ADMIN' })).toBe(false);
    expect(change({ entryYear: 1949 })).toBe(false);
    expect(change({ graduationYear: 2101 })).toBe(false);
    expect(change({ graduationYear: null })).toBe(true);
    expect(change({ userId: 'x' })).toBe(false);
  });

  it('atama: kapsam kimliği yalnız ilgili kapsamda; yanlış kapsam alanı reddedilir', () => {
    expect(ok(grantAdminSchema, { scope: 'SYSTEM', userId: 'u' })).toBe(true);
    expect(ok(grantAdminSchema, { scope: 'SYSTEM', userId: 'u', facultyId: 'f' })).toBe(false);
    expect(ok(grantAdminSchema, { scope: 'FACULTY', userId: 'u', facultyId: 'f' })).toBe(true);
    expect(ok(grantAdminSchema, { scope: 'FACULTY', userId: 'u' })).toBe(false);
    expect(ok(grantAdminSchema, { scope: 'FACULTY', userId: 'u', departmentId: 'd' })).toBe(false);
    expect(ok(grantAdminSchema, { scope: 'DEPARTMENT', userId: 'u', departmentId: 'd' })).toBe(
      true,
    );
    expect(ok(grantAdminSchema, { scope: 'DEPARTMENT', userId: 'u', facultyId: 'f' })).toBe(false);
    expect(ok(grantAdminSchema, { scope: 'ROOT', userId: 'u' })).toBe(false);
    expect(ok(grantAdminSchema, { userId: 'u' })).toBe(false);
  });

  it('kaldırmada gerekçe zorunlu', () => {
    expect(ok(revokeAdminSchema, { grantId: 'g' })).toBe(false);
    expect(ok(revokeAdminSchema, { grantId: 'g', reason: 'ab' })).toBe(false);
  });
});

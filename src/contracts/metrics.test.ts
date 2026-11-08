import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';

import {
  EVENT_PROPS_SCHEMAS,
  EVENT_TYPES,
  METRICS_ACTION_ERRORS,
  USAGE_EXPORT_ERRORS,
  USAGE_EXPORT_HREF,
  eventInputSchema,
  resultBucketOf,
  usageCellSchema,
  usageExportHref,
  usageMetricsFilterSchema,
  usageMetricsSchema,
} from './metrics';

const valid: Record<(typeof EVENT_TYPES)[number], unknown> = {
  LOGIN: { method: 'EMAIL_LINK' },
  PROFILE_THRESHOLD: { threshold: 80 },
  CV_UPLOADED: {},
  CV_APPLIED: { created: 2, updated: 1 },
  EXPERIENCE_PUBLISHED: { experienceType: 'INTERNSHIP', anonymous: true },
  SEARCH: { filters: ['q', 'types'], results: 'FEW' },
  MENTOR_SEARCH: { filters: ['onlyAvailable'], results: 'NONE' },
  MENTOR_VIEWED: {},
  APPOINTMENT_REQUESTED: { mode: 'ONLINE' },
  APPOINTMENT_CONFIRMED: { mode: 'IN_PERSON' },
  APPOINTMENT_COMPLETED: { mode: 'ONLINE' },
  FAQ_REQUESTED: {},
  FAQ_PUBLISHED: {},
  CV_REVIEW_REQUESTED: {},
  CONTACT_REQUESTED: { fieldCount: 2 },
  JOB_POSTING_PUBLISHED: { kind: 'INTERNSHIP' },
  JOB_POSTING_VIEWED: {},
  JOB_POSTING_SEARCH: { results: 'FEW' },
  JOB_SEEKER_SEARCH: { results: 'NONE' },
};

describe('olay türü kataloğu', () => {
  it('her tür için bir şema vardır ve örnek props geçerlidir', () => {
    expect(Object.keys(EVENT_PROPS_SCHEMAS).sort()).toEqual([...EVENT_TYPES].sort());
    for (const type of EVENT_TYPES) {
      expect(EVENT_PROPS_SCHEMAS[type].safeParse(valid[type]).success, type).toBe(true);
      expect(eventInputSchema.safeParse({ type, props: valid[type] }).success, type).toBe(true);
    }
  });

  it('KİŞİSEL VERİ girişimleri her türde reddedilir (rastgele e-posta, telefon, ad, serbest metin, kimlik)', () => {
    const secrets = {
      email: `${randomUUID()}@ornek.test`,
      phone: '05321234567',
      name: `Ad ${randomUUID()}`,
      query: 'veri analisti istanbul',
      userId: randomUUID(),
    };
    for (const type of EVENT_TYPES) {
      for (const [key, value] of Object.entries(secrets)) {
        const attempt = { ...(valid[type] as object), [key]: value };
        expect(EVENT_PROPS_SCHEMAS[type].safeParse(attempt).success, `${type}.${key}`).toBe(false);
      }
    }
    // Değer alanına gömülü kişisel veri de geçemez (alanlar enum/sayı/mantıksal).
    expect(
      EVENT_PROPS_SCHEMAS.SEARCH.safeParse({ filters: [secrets.email], results: 'FEW' }).success,
    ).toBe(false);
    expect(
      EVENT_PROPS_SCHEMAS.SEARCH.safeParse({ filters: ['q'], results: secrets.phone }).success,
    ).toBe(false);
    expect(EVENT_PROPS_SCHEMAS.LOGIN.safeParse({ method: secrets.email }).success).toBe(false);
    expect(
      EVENT_PROPS_SCHEMAS.CV_APPLIED.safeParse({ created: secrets.phone, updated: 0 }).success,
    ).toBe(false);
  });

  it('tür ile props eşleşmek zorundadır; bilinmeyen tür reddedilir', () => {
    expect(eventInputSchema.safeParse({ type: 'LOGIN', props: valid.SEARCH }).success).toBe(false);
    expect(eventInputSchema.safeParse({ type: 'ROKET', props: {} }).success).toBe(false);
    expect(
      eventInputSchema.safeParse({ type: 'LOGIN', props: { method: 'EMAIL_LINK' }, userId: 'x' })
        .success,
    ).toBe(false);
  });

  it('arama olayı yalnız süzgeç TÜRÜ taşır: tekrar eden/bilinmeyen anahtar ve değer reddedilir', () => {
    expect(
      EVENT_PROPS_SCHEMAS.SEARCH.safeParse({ filters: ['q', 'q'], results: 'FEW' }).success,
    ).toBe(false);
    expect(
      EVENT_PROPS_SCHEMAS.SEARCH.safeParse({ filters: ['sorgu'], results: 'FEW' }).success,
    ).toBe(false);
    expect(EVENT_PROPS_SCHEMAS.SEARCH.safeParse({ filters: [], results: 'NONE' }).success).toBe(
      true,
    );
  });

  it('sonuç kovası ve eşik sınırları', () => {
    expect([0, 1, 5, 6, 100].map(resultBucketOf)).toEqual(['NONE', 'FEW', 'FEW', 'MANY', 'MANY']);
    expect(EVENT_PROPS_SCHEMAS.PROFILE_THRESHOLD.safeParse({ threshold: 60 }).success).toBe(false);
    expect(EVENT_PROPS_SCHEMAS.CONTACT_REQUESTED.safeParse({ fieldCount: 5 }).success).toBe(false);
  });
});

describe('panel süzgeci', () => {
  const base = { from: '2030-01-01T00:00:00Z', to: '2030-02-01T00:00:00Z' };
  const ok = (value: unknown) => usageMetricsFilterSchema.safeParse(value).success;
  it('yarı açık aralık, en çok 366 gün, ters aralık geçersiz', () => {
    expect(ok(base)).toBe(true);
    expect(ok({ ...base, to: base.from })).toBe(false);
    expect(ok({ from: base.to, to: base.from })).toBe(false);
    expect(ok({ from: '2030-01-01T00:00:00Z', to: '2031-01-02T00:00:00Z' })).toBe(true); // tam 366 gün
    expect(ok({ from: '2030-01-01T00:00:00Z', to: '2031-01-03T00:00:00Z' })).toBe(false);
    expect(ok({ ...base, from: 'dün' })).toBe(false);
  });
  it('bölüm ve fakülte birlikte verilemez; tür listesi tekrarsız; kimlik/rol alanı reddedilir', () => {
    expect(ok({ ...base, departmentId: 'd' })).toBe(true);
    expect(ok({ ...base, facultyId: 'f' })).toBe(true);
    expect(ok({ ...base, departmentId: 'd', facultyId: 'f' })).toBe(false);
    expect(ok({ ...base, types: ['LOGIN', 'LOGIN'] })).toBe(false);
    expect(ok({ ...base, types: [] })).toBe(false);
    expect(ok({ ...base, userId: 'baska' })).toBe(false);
    expect(ok({ ...base, role: 'SYSTEM' })).toBe(false);
  });
  it('dışa aktarma bağlantısı süzgeçle gidiş-dönüş yapar', () => {
    const href = usageExportHref({ ...base, departmentId: 'bolum-1', types: ['SEARCH', 'LOGIN'] });
    expect(href.startsWith(`${USAGE_EXPORT_HREF}?`)).toBe(true);
    const params = new URL(`http://x${href}`).searchParams;
    expect(params.getAll('types')).toEqual(['LOGIN', 'SEARCH']);
    expect(params.get('departmentId')).toBe('bolum-1');
    expect(() => usageExportHref({ ...base, to: base.from })).toThrow();
  });
});

describe('çıktı şemaları', () => {
  const cell = {
    kind: 'NAMED',
    type: 'LOGIN',
    role: 'STUDENT',
    departmentId: 'd',
    departmentName: 'YBS',
    events: 10,
    users: 3,
  };
  it('hücre en az eşik kadar kullanıcı ister; ek alan kabul etmez', () => {
    expect(usageCellSchema.safeParse(cell).success).toBe(true);
    expect(usageCellSchema.safeParse({ ...cell, users: 2 }).success).toBe(false);
    expect(usageCellSchema.safeParse({ ...cell, userId: 'x' }).success).toBe(false);
  });
  it('etkin kullanıcı sayısı eşiğin altında null olmak zorundadır', () => {
    const base = { from: new Date(), to: new Date(), minGroupSize: 3, totalsByType: [], cells: [] };
    expect(usageMetricsSchema.safeParse({ ...base, activeUsers: null }).success).toBe(true);
    expect(usageMetricsSchema.safeParse({ ...base, activeUsers: 2 }).success).toBe(false);
    expect(usageMetricsSchema.safeParse({ ...base, activeUsers: 3 }).success).toBe(true);
  });
  it('hata kodları kayıtlıdır', () => {
    for (const code of [...Object.values(METRICS_ACTION_ERRORS).flat(), ...USAGE_EXPORT_ERRORS]) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});

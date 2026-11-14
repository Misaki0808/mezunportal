import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';
import { failureFromZod } from '@/lib/action-result';

import {
  PROFILE_CONTENT_ACTION_ERRORS,
  SOCIAL_LINK_HOSTS,
  SOCIAL_LINK_KINDS,
  addProfileSkillSchema,
  deleteProfileEntrySchema,
  normalizeLinkedinUrl,
  normalizeSocialLink,
  profileViewSchema,
  saveProfileEntrySchema,
  setLinkedinUrlSchema,
  setSocialLinksSchema,
  updateProfileBasicsSchema,
} from './profile-content';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('normalizeSocialLink', () => {
  it.each([
    ['GITHUB', 'https://github.com/ornek', 'https://github.com/ornek'],
    ['GITHUB', 'https://www.GitHub.com/ornek/', 'https://github.com/ornek'],
    ['GITHUB', 'https://github.com/ornek?tab=repositories#readme', 'https://github.com/ornek'],
    ['X', 'https://twitter.com/ornek', 'https://twitter.com/ornek'],
    ['X', 'https://x.com/ornek', 'https://x.com/ornek'],
    ['MEDIUM', 'https://ornek.medium.com/yazi', 'https://ornek.medium.com/yazi'],
    ['YOUTUBE', 'https://www.youtube.com/@ornek', 'https://youtube.com/@ornek'],
  ] as const)('%s %s → %s', (kind, raw, expected) => {
    expect(normalizeSocialLink(kind, raw)).toEqual({ ok: true, url: expected });
  });

  it.each([
    ['http://github.com/ornek', 'PROFILE_LINK_NOT_HTTPS'],
    ['ftp://github.com/ornek', 'PROFILE_LINK_INVALID'],
    ['javascript:alert(1)', 'PROFILE_LINK_INVALID'],
    ['data:text/html,<b>', 'PROFILE_LINK_INVALID'],
    ['github.com/ornek', 'PROFILE_LINK_INVALID'],
    ['', 'PROFILE_LINK_INVALID'],
    ['https://github.com/or nek', 'PROFILE_LINK_INVALID'],
    ['https://user:pass@github.com/ornek', 'PROFILE_LINK_INVALID'],
    ['https://github.com:8443/ornek', 'PROFILE_LINK_INVALID'],
    ['https://140.82.112.3/ornek', 'PROFILE_LINK_INVALID'],
    ['https://[::1]/ornek', 'PROFILE_LINK_INVALID'],
    ['https://evil.com/github.com/ornek', 'PROFILE_LINK_HOST_NOT_ALLOWED'],
    ['https://github.com.evil.com/ornek', 'PROFILE_LINK_HOST_NOT_ALLOWED'],
    ['https://evilgithub.com/ornek', 'PROFILE_LINK_HOST_NOT_ALLOWED'],
    ['https://gist.github.com/ornek', 'PROFILE_LINK_HOST_NOT_ALLOWED'],
    ['https://gіthub.com/ornek', 'PROFILE_LINK_HOST_NOT_ALLOWED'], // Kiril “і”
    [`https://github.com/${'a'.repeat(250)}`, 'PROFILE_LINK_INVALID'],
  ])('GITHUB için %j reddedilir (%s)', (raw, problem) => {
    expect(normalizeSocialLink('GITHUB', raw)).toEqual({ ok: false, problem });
  });

  it('alt alan adı yalnız izinli türde (Medium) ve yalnız tek etiket olarak kabul edilir', () => {
    expect(normalizeSocialLink('MEDIUM', 'https://a.b.medium.com/x').ok).toBe(false);
    expect(normalizeSocialLink('MEDIUM', 'https://medium.com.evil.com/x').ok).toBe(false);
    expect(normalizeSocialLink('GITLAB', 'https://ornek.gitlab.com/x').ok).toBe(false);
  });

  it('bir türün alan adı başka tür için geçmez', () => {
    expect(normalizeSocialLink('GITLAB', 'https://github.com/ornek').ok).toBe(false);
    for (const kind of SOCIAL_LINK_KINDS) {
      for (const host of SOCIAL_LINK_HOSTS[kind].hosts) {
        expect(normalizeSocialLink(kind, `https://${host}/ornek`).ok, `${kind} ${host}`).toBe(true);
      }
    }
  });
});

describe('normalizeLinkedinUrl', () => {
  it.each([
    ['https://www.linkedin.com/in/ayse-ornek', 'https://www.linkedin.com/in/ayse-ornek'],
    ['https://linkedin.com/in/ayse-ornek/', 'https://www.linkedin.com/in/ayse-ornek'],
    [
      'https://tr.linkedin.com/in/ayşe-örnek?trk=x',
      'https://www.linkedin.com/in/ay%C5%9Fe-%C3%B6rnek',
    ],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeLinkedinUrl(raw)).toEqual({ ok: true, url: expected });
  });

  it.each([
    'http://www.linkedin.com/in/ayse-ornek',
    'https://www.linkedin.com/company/acme',
    'https://www.linkedin.com/in/',
    'https://www.linkedin.com/in/ab',
    'https://www.linkedin.com/in/a/b',
    'https://www.linkedin.com/in/abc%2Fdef',
    'https://www.linkedin.com/in/abc%5Cdef',
    'https://www.linkedin.com/in/abc%00def',
    'https://www.linkedin.com/in/abc%ZZdef',
    'https://www.linkedin.com/in/abc%252Fdef',
    'https://linkedin.com.evil.com/in/ayse-ornek',
    'https://evil.com/in/ayse-ornek',
  ])('%s reddedilir', (raw) => {
    expect(normalizeLinkedinUrl(raw).ok).toBe(false);
  });
});

describe('bağlantı şemaları', () => {
  const errors = (schema: { safeParse: (v: unknown) => unknown }, v: unknown) => {
    const result = schema.safeParse(v) as { success: boolean; error?: import('zod').ZodError };
    return result.success ? null : failureFromZod(result.error!).fieldErrors;
  };

  it('kanonik adres döner; hata alan altında kararlı kodla', () => {
    expect(
      setSocialLinksSchema.parse({
        links: [{ kind: 'GITHUB', url: 'https://www.github.com/a/?x=1' }],
      }),
    ).toEqual({
      links: [{ kind: 'GITHUB', url: 'https://github.com/a' }],
    });
    expect(
      errors(setSocialLinksSchema, { links: [{ kind: 'GITHUB', url: 'http://github.com/a' }] }),
    ).toEqual({
      'links.0.url': 'PROFILE_LINK_NOT_HTTPS',
    });
    expect(
      errors(setSocialLinksSchema, { links: [{ kind: 'GITHUB', url: 'https://evil.com/a' }] }),
    ).toEqual({
      'links.0.url': 'PROFILE_LINK_HOST_NOT_ALLOWED',
    });
  });

  it('tür başına tek bağlantı; en fazla tür sayısı; boş liste hepsini kaldırır', () => {
    expect(ok(setSocialLinksSchema, { links: [] })).toBe(true);
    const link = { kind: 'GITHUB', url: 'https://github.com/a' };
    expect(ok(setSocialLinksSchema, { links: [link, link] })).toBe(false);
    expect(
      ok(setSocialLinksSchema, { links: [{ kind: 'REDDIT', url: 'https://reddit.com/u/a' }] }),
    ).toBe(false);
    expect(ok(setSocialLinksSchema, { links: [link], extra: 1 })).toBe(false);
  });

  it('LinkedIn: null kaldırır, geçersiz adres reddedilir', () => {
    expect(setLinkedinUrlSchema.parse({ url: null })).toEqual({ url: null });
    expect(setLinkedinUrlSchema.parse({ url: 'https://tr.linkedin.com/in/ayse-ornek' }).url).toBe(
      'https://www.linkedin.com/in/ayse-ornek',
    );
    expect(errors(setLinkedinUrlSchema, { url: 'https://example.com/in/ayse' })).toEqual({
      url: 'PROFILE_LINK_HOST_NOT_ALLOWED',
    });
  });
});

describe('temel alanlar, kalemler, beceriler', () => {
  it('boş metin alanı temizler; hiç alan yoksa geçersiz; sınırlar', () => {
    expect(updateProfileBasicsSchema.parse({ headline: '  ', city: ' İstanbul ' })).toEqual({
      headline: null,
      city: 'İstanbul',
    });
    expect(ok(updateProfileBasicsSchema, {})).toBe(false);
    expect(ok(updateProfileBasicsSchema, { headline: 'x'.repeat(121) })).toBe(false);
    expect(ok(updateProfileBasicsSchema, { summary: 'x'.repeat(1500) })).toBe(true);
    expect(ok(updateProfileBasicsSchema, { role: 'ADMIN', headline: 'a' })).toBe(false);
  });

  it('kalem değerleri CV şemasıyla aynı doğrulamadan geçer; bölüm/değer uyumu', () => {
    expect(
      ok(saveProfileEntrySchema, {
        section: 'LANGUAGE',
        values: { name: 'İngilizce', level: 'B2' },
      }),
    ).toBe(true);
    expect(
      ok(saveProfileEntrySchema, {
        section: 'LANGUAGE',
        values: { name: 'İngilizce', level: 'D9' },
      }),
    ).toBe(false);
    expect(
      ok(saveProfileEntrySchema, {
        section: 'POSITION',
        id: 'p1',
        values: { company: 'A', title: 'B', startDate: '2024-09', endDate: '2024-07' },
      }),
    ).toBe(false);
    expect(
      ok(saveProfileEntrySchema, { section: 'EDUCATION', values: { company: 'A', title: 'B' } }),
    ).toBe(false);
    expect(ok(saveProfileEntrySchema, { section: 'SKILL', values: { name: 'x' } })).toBe(false);
    expect(
      ok(saveProfileEntrySchema, { section: 'LANGUAGE', values: { name: 'x' }, userId: 'baska' }),
    ).toBe(false);
  });

  it('silme ve beceri girdileri', () => {
    expect(ok(deleteProfileEntrySchema, { section: 'POSITION', id: 'x' })).toBe(true);
    expect(ok(deleteProfileEntrySchema, { section: 'SKILL', id: 'x' })).toBe(false);
    expect(addProfileSkillSchema.parse({ name: '  Type​Script ' })).toEqual({ name: 'TypeScript' });
    expect(ok(addProfileSkillSchema, { name: '' })).toBe(false);
    expect(ok(addProfileSkillSchema, { name: 'x'.repeat(81) })).toBe(false);
  });
});

describe('başkasının profili çıktısı', () => {
  const base = {
    userId: 'u',
    displayName: 'Ad',
    memberships: [],
    education: [],
    positions: [],
    languages: [],
    certifications: [],
    skills: [],
    lastUpdatedAt: null,
  };

  it('gizli alanlar anahtar olarak yoktur; kimlik/kaynak/düzeltme/tamamlama alanı eklenemez', () => {
    expect(ok(profileViewSchema, base)).toBe(true);
    for (const extra of [
      'source',
      'manuallyEdited',
      'completion',
      'cvUpdatedAt',
      'tagId',
      'storageKey',
      'onboardingStep',
    ]) {
      expect(ok(profileViewSchema, { ...base, [extra]: 'x' }), extra).toBe(false);
    }
    expect(
      ok(profileViewSchema, {
        ...base,
        education: [
          {
            institution: 'Ü',
            level: null,
            fieldOfStudy: null,
            startDate: null,
            endDate: null,
            isCurrent: false,
            id: 'x',
          },
        ],
      }),
    ).toBe(false);
  });
});

describe('hata kodu kaydı', () => {
  it('bütün eylem hata kodları kayıtlıdır', () => {
    for (const codes of Object.values(PROFILE_CONTENT_ACTION_ERRORS)) {
      for (const code of codes) expect(ERROR_CODES).toContain(code);
    }
  });
});

it('profil kalemi ve beceri alanlarından iletişim biçimi geçirilemez', () => {
  expect(addProfileSkillSchema.safeParse({ name: 'SQL ornek@example.org' }).success).toBe(false);
  const value = {
    section: 'POSITION',
    values: { company: 'Örnek', title: 'Analist', description: '+90 532 123 45 67' },
  };
  const parsed = saveProfileEntrySchema.safeParse(value);
  expect(parsed.success).toBe(false);
  if (!parsed.success)
    expect(failureFromZod(parsed.error)).toMatchObject({
      fieldErrors: { 'values.description': 'PROFILE_TEXT_PERSONAL_DATA' },
    });
});

import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';
import { hasPersonalDataPattern } from '@/lib/personal-data';

import {
  CV_LIMITS,
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  LANGUAGE_LEVELS,
  parsedCertificationSchema,
  parsedEducationSchema,
  parsedLanguageSchema,
  parsedPositionSchema,
  parsedSkillSchema,
  type ParsedCertification,
  type ParsedEducation,
  type ParsedLanguage,
  type ParsedPosition,
} from './cv';
import { COMPLETION_FIELDS } from './profile';

/**
 * Profil içeriği sözleşmesi (P1-06; docs/faz1-plan.md). Kendi profilini görüntüle/düzenle, başkasının profilini
 * görünürlük süzgeciyle görüntüle. Servis (W1) ve ekran (W2/R1) paylaşır; ikisi de DEĞİŞTİRMEZ.
 *
 * İlkeler (sunucuda zorlanır):
 *  - Kimlik oturumdan gelir; `userId` yalnız BAŞKASININ profilini görüntülerken hedeftir ve yetki vermez.
 *  - Başkasının profilinde gizli alan yanıtta HİÇ yoktur (anahtar bile; `null` değil). Görünürlük kararı
 *    `rules/visibility.ts` tablosundadır; ekran kuralı tekrar hesaplamaz.
 *  - Kendi düzenlemen kalemi "elle düzeltilmiş" yapar; yeni CV bunu sessizce ezmez (CV çakışma olarak sorar).
 *  - Bağlantılar yalnız `https` ve izinli alan adlarıdır (`SOCIAL_LINK_HOSTS`); sorgu/parça atılır.
 *  - Beceri `Tag` (tür SKILL) + kullanıcı-etiket bağıdır; serbest metin normalleştirilir, sözlükte yoksa
 *    eşleşmeyen değer kuyruğuna düşer ve etiket başkalarına öneri olarak LİSTELENMEZ (`curated = false`).
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;
const id = z
  .string({ error: INVALID })
  .trim()
  .min(1, { error: INVALID })
  .max(64, { error: INVALID });

// ---------------------------------------------------------------------------------------------
// Bağlantılar (yalnız https + izinli alan adı)
// ---------------------------------------------------------------------------------------------

export const SOCIAL_LINK_KINDS = [
  'GITHUB',
  'GITLAB',
  'BEHANCE',
  'DRIBBBLE',
  'MEDIUM',
  'KAGGLE',
  'STACKOVERFLOW',
  'HUGGINGFACE',
  'X',
  'YOUTUBE',
] as const;
export type SocialLinkKind = (typeof SOCIAL_LINK_KINDS)[number];

/** İzinli alan adları (tam eşleşme; `www.` öneki serbest). `subdomains`: `ad.medium.com` gibi kullanıcı alt alanları. */
export const SOCIAL_LINK_HOSTS: Record<
  SocialLinkKind,
  { hosts: readonly string[]; subdomains?: boolean }
> = {
  GITHUB: { hosts: ['github.com'] },
  GITLAB: { hosts: ['gitlab.com'] },
  BEHANCE: { hosts: ['behance.net'] },
  DRIBBBLE: { hosts: ['dribbble.com'] },
  MEDIUM: { hosts: ['medium.com'], subdomains: true },
  KAGGLE: { hosts: ['kaggle.com'] },
  STACKOVERFLOW: { hosts: ['stackoverflow.com'] },
  HUGGINGFACE: { hosts: ['huggingface.co'] },
  X: { hosts: ['x.com', 'twitter.com'] },
  YOUTUBE: { hosts: ['youtube.com'] },
};
export const LINKEDIN_HOSTS = ['linkedin.com', 'tr.linkedin.com'] as const;
export const SOCIAL_LINK_MAX = SOCIAL_LINK_KINDS.length;
const LINK_PATH_MAX = 200;
const CONTROL_OR_SPACE = /[\u0000- \u007F-\u009F]/;

export type LinkProblem =
  'PROFILE_LINK_INVALID' | 'PROFILE_LINK_NOT_HTTPS' | 'PROFILE_LINK_HOST_NOT_ALLOWED';

function parseHttpsUrl(raw: string): { url: URL } | { problem: LinkProblem } {
  const text = raw.trim();
  if (text === '' || text.length > 400 || CONTROL_OR_SPACE.test(text)) {
    return { problem: 'PROFILE_LINK_INVALID' };
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { problem: 'PROFILE_LINK_INVALID' };
  }
  if (url.protocol !== 'https:') {
    return {
      problem: url.protocol === 'http:' ? 'PROFILE_LINK_NOT_HTTPS' : 'PROFILE_LINK_INVALID',
    };
  }
  // Kimlik bilgisi, özel port ve ham IP adresi bağlantı olarak kabul edilmez.
  if (url.username !== '' || url.password !== '' || url.port !== '') {
    return { problem: 'PROFILE_LINK_INVALID' };
  }
  if (/^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) {
    return { problem: 'PROFILE_LINK_INVALID' };
  }
  return { url };
}

const stripWww = (host: string) => (host.startsWith('www.') ? host.slice(4) : host);

/**
 * İzinli alan adı kontrolü + kanonik biçim: `https://<alan adı><yol>` (sorgu, parça ve sondaki `/` atılır).
 * Alan adı IDN/punycode benzerlerine karşı yalnız ASCII listesiyle TAM eşleşir.
 */
export function normalizeSocialLink(
  kind: SocialLinkKind,
  raw: string,
): { ok: true; url: string } | { ok: false; problem: LinkProblem } {
  const parsed = parseHttpsUrl(raw);
  if ('problem' in parsed) return { ok: false, problem: parsed.problem };
  const host = stripWww(parsed.url.hostname.toLowerCase());
  const rule = SOCIAL_LINK_HOSTS[kind];
  const allowed =
    rule.hosts.includes(host) ||
    (rule.subdomains === true &&
      rule.hosts.some(
        (base) => host.endsWith(`.${base}`) && /^[a-z0-9-]+$/.test(host.slice(0, -base.length - 1)),
      ));
  if (!allowed) return { ok: false, problem: 'PROFILE_LINK_HOST_NOT_ALLOWED' };
  const path = parsed.url.pathname.replace(/\/+$/, '');
  if (path.length > LINK_PATH_MAX) return { ok: false, problem: 'PROFILE_LINK_INVALID' };
  return { ok: true, url: `https://${host}${path}` };
}

/** LinkedIn profil adresi: yalnız `https://[www|tr].linkedin.com/in/<kullanıcı-adı>`; kanonik `www` biçimi. */
export function normalizeLinkedinUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; problem: LinkProblem } {
  const parsed = parseHttpsUrl(raw);
  if ('problem' in parsed) return { ok: false, problem: parsed.problem };
  const host = stripWww(parsed.url.hostname.toLowerCase());
  if (!(LINKEDIN_HOSTS as readonly string[]).includes(host)) {
    return { ok: false, problem: 'PROFILE_LINK_HOST_NOT_ALLOWED' };
  }
  const match = /^\/in\/([\p{L}\p{N}_%-]{3,100})\/?$/u.exec(parsed.url.pathname);
  if (!match?.[1]) return { ok: false, problem: 'PROFILE_LINK_INVALID' };
  let username: string;
  try {
    username = decodeURIComponent(match[1]);
  } catch {
    return { ok: false, problem: 'PROFILE_LINK_INVALID' };
  }
  // Kodlanmış ayraç/kontrol ve çift kodlama kullanıcı adı olamaz; Unicode harfler korunur.
  if (!/^[\p{L}\p{N}_-]{3,100}$/u.test(username)) {
    return { ok: false, problem: 'PROFILE_LINK_INVALID' };
  }
  return { ok: true, url: `https://www.linkedin.com/in/${encodeURIComponent(username)}` };
}

const linkUrl = (check: (raw: string) => ReturnType<typeof normalizeLinkedinUrl>) =>
  z.string({ error: 'PROFILE_LINK_INVALID' }).transform((raw, ctx) => {
    const result = check(raw);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.problem });
      return z.NEVER;
    }
    return result.url;
  });

export const socialLinkSchema = z
  .object({
    kind: z.enum(SOCIAL_LINK_KINDS, { error: INVALID }),
    url: z.string({ error: 'PROFILE_LINK_INVALID' }),
  })
  .strict()
  .transform((link, ctx) => {
    const result = normalizeSocialLink(link.kind, link.url);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: result.problem });
      return z.NEVER;
    }
    return { kind: link.kind, url: result.url };
  });
export type SocialLink = z.output<typeof socialLinkSchema>;

/** Bağlantı kümesini TAMAMEN değiştirir (boş liste hepsini kaldırır); tür başına en fazla bir bağlantı. */
export const setSocialLinksSchema = z
  .object({
    links: z
      .array(socialLinkSchema, { error: INVALID })
      .max(SOCIAL_LINK_MAX, { error: INVALID })
      .refine((links) => new Set(links.map((link) => link.kind)).size === links.length, {
        error: INVALID,
      }),
  })
  .strict();
export type SetSocialLinksInput = z.input<typeof setSocialLinksSchema>;

/** `null` LinkedIn adresini kaldırır. */
export const setLinkedinUrlSchema = z
  .object({ url: linkUrl(normalizeLinkedinUrl).nullable() })
  .strict();
export type SetLinkedinUrlInput = z.input<typeof setLinkedinUrlSchema>;

// ---------------------------------------------------------------------------------------------
// Temel alanlar
// ---------------------------------------------------------------------------------------------

export const PROFILE_TEXT_LIMITS = { headline: 120, summary: 1500, city: 80, goals: 500 } as const;
const optionalText = (max: number) =>
  z
    .string({ error: INVALID })
    .trim()
    .max(max, { error: INVALID })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .refine((value) => value === null || !hasPersonalDataPattern(value), {
      error: 'PROFILE_TEXT_PERSONAL_DATA',
    });

/** Verilmeyen alan değişmez; `null` ya da boş metin alanı temizler. En az bir alan verilmelidir. */
export const updateProfileBasicsSchema = z
  .object({
    headline: optionalText(PROFILE_TEXT_LIMITS.headline).optional(),
    summary: optionalText(PROFILE_TEXT_LIMITS.summary).optional(),
    city: optionalText(PROFILE_TEXT_LIMITS.city).optional(),
    goals: optionalText(PROFILE_TEXT_LIMITS.goals).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), { error: INVALID });
export type UpdateProfileBasicsInput = z.input<typeof updateProfileBasicsSchema>;

// ---------------------------------------------------------------------------------------------
// Kalemler (eğitim, pozisyon, dil, sertifika) ve beceriler
// ---------------------------------------------------------------------------------------------

export const PROFILE_ENTRY_SECTIONS = [
  'EDUCATION',
  'POSITION',
  'LANGUAGE',
  'CERTIFICATION',
] as const;
export type ProfileEntrySection = (typeof PROFILE_ENTRY_SECTIONS)[number];

/** Bölüm başına en fazla kalem (CV hattıyla aynı sınırlar). */
export const PROFILE_ENTRY_LIMITS = {
  EDUCATION: CV_LIMITS.education,
  POSITION: CV_LIMITS.positions,
  LANGUAGE: CV_LIMITS.languages,
  CERTIFICATION: CV_LIMITS.certifications,
} as const satisfies Record<ProfileEntrySection, number>;
export const PROFILE_SKILL_LIMIT = CV_LIMITS.skills;

/**
 * Kalem ekle/güncelle: `id` yoksa yeni kalem (kaynak `MANUAL`), varsa kendi kalemin güncellenir ve "elle
 * düzeltilmiş" olur. Değerler CV ayrıştırmasıyla AYNI şemalardır (tarihler `YYYY` / `YYYY-MM`).
 */
export const saveProfileEntrySchema = z
  .discriminatedUnion(
    'section',
    [
      z
        .object({
          section: z.literal('EDUCATION'),
          id: id.optional(),
          values: parsedEducationSchema,
        })
        .strict(),
      z
        .object({ section: z.literal('POSITION'), id: id.optional(), values: parsedPositionSchema })
        .strict(),
      z
        .object({ section: z.literal('LANGUAGE'), id: id.optional(), values: parsedLanguageSchema })
        .strict(),
      z
        .object({
          section: z.literal('CERTIFICATION'),
          id: id.optional(),
          values: parsedCertificationSchema,
        })
        .strict(),
    ],
    { error: INVALID },
  )
  .superRefine((input, ctx) => {
    for (const [field, value] of Object.entries(input.values)) {
      if (typeof value === 'string' && hasPersonalDataPattern(value))
        ctx.addIssue({
          code: 'custom',
          path: ['values', field],
          message: 'PROFILE_TEXT_PERSONAL_DATA',
        });
    }
  });
export type SaveProfileEntryInput = z.input<typeof saveProfileEntrySchema>;

export const deleteProfileEntrySchema = z
  .object({ section: z.enum(PROFILE_ENTRY_SECTIONS, { error: INVALID }), id })
  .strict();
export type DeleteProfileEntryInput = z.input<typeof deleteProfileEntrySchema>;

/** Serbest metin beceri: normalleştirilir (büyük/küçük harf, Türkçe harf), aynı beceri ikinci kez eklenmez. */
export const addProfileSkillSchema = z
  .object({
    name: parsedSkillSchema.refine((value) => !hasPersonalDataPattern(value), {
      error: 'PROFILE_TEXT_PERSONAL_DATA',
    }),
  })
  .strict();
export type AddProfileSkillInput = z.input<typeof addProfileSkillSchema>;
export const removeProfileSkillSchema = z.object({ tagId: id }).strict();
export type RemoveProfileSkillInput = z.input<typeof removeProfileSkillSchema>;

// ---------------------------------------------------------------------------------------------
// Tamamlama göstergesi (ilk giriş adımları + profil içeriği)
// ---------------------------------------------------------------------------------------------

/** İlk giriş adımlarına profil içeriği adımları eklenir (CV adımı P1-04 kararıyla burada paydaya girer). */
export const CONTENT_COMPLETION_FIELDS = ['BASICS', 'EDUCATION', 'SKILLS', 'CV'] as const;
export const PROFILE_COMPLETION_FIELDS = [
  ...COMPLETION_FIELDS,
  ...CONTENT_COMPLETION_FIELDS,
] as const;
export type ProfileCompletionField = (typeof PROFILE_COMPLETION_FIELDS)[number];
/** `SKILLS` adımı için gereken en az beceri sayısı. */
export const SKILLS_MIN_FOR_COMPLETION = 3;

export const profileContentCompletionSchema = z
  .object({
    percent: z.number().int().min(0).max(100),
    missing: z.array(z.enum(PROFILE_COMPLETION_FIELDS)),
  })
  .strict();
export type ProfileContentCompletion = z.infer<typeof profileContentCompletionSchema>;

// ---------------------------------------------------------------------------------------------
// Çıktılar
// ---------------------------------------------------------------------------------------------

const ym = z.string().nullable();
/** Kalem alanları çıktıda düz biçimdedir (girdi şemalarının çıktı karşılığı). */
const educationShape = {
  institution: z.string(),
  level: z.enum(EDUCATION_LEVELS).nullable(),
  fieldOfStudy: z.string().nullable(),
  startDate: ym,
  endDate: ym,
  isCurrent: z.boolean(),
};
const positionShape = {
  company: z.string(),
  title: z.string(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
  startDate: ym,
  endDate: ym,
  isCurrent: z.boolean(),
  description: z.string().nullable(),
};
const languageShape = { name: z.string(), level: z.enum(LANGUAGE_LEVELS).nullable() };
const certificationShape = { name: z.string(), issuer: z.string().nullable(), issuedDate: ym };

const entryMeta = {
  id: z.string(),
  source: z.enum(['CV', 'MANUAL']),
  /** Kullanıcı düzelttiyse yeni CV bu kalemi sessizce ezmez. */
  manuallyEdited: z.boolean(),
};

export const profileSkillSchema = z.object({ tagId: z.string(), label: z.string() }).strict();

/** Kendi profilin: kaynak/düzeltme bilgisi ve kimlikler dahil. */
export const myProfileSchema = z
  .object({
    userId: z.string(),
    displayName: z.string(),
    headline: z.string().nullable(),
    summary: z.string().nullable(),
    city: z.string().nullable(),
    goals: z.string().nullable(),
    education: z.array(z.object({ ...entryMeta, ...educationShape }).strict()),
    positions: z.array(z.object({ ...entryMeta, ...positionShape }).strict()),
    languages: z.array(z.object({ ...entryMeta, ...languageShape }).strict()),
    certifications: z.array(z.object({ ...entryMeta, ...certificationShape }).strict()),
    skills: z.array(profileSkillSchema),
    socialLinks: z.array(z.object({ kind: z.enum(SOCIAL_LINK_KINDS), url: z.string() }).strict()),
    linkedinUrl: z.string().nullable(),
    cvUpdatedAt: z.date().nullable(),
    /** Profildeki herhangi bir içeriğin son değişme anı. */
    lastUpdatedAt: z.date().nullable(),
    completion: profileContentCompletionSchema,
  })
  .strict();
export type MyProfile = z.infer<typeof myProfileSchema>;

/**
 * Başkasının profili. Her alan isteğe bağlıdır: görünürlük süzgecinden geçmeyen alanın ANAHTARI yanıtta
 * yoktur. Kimlik, kaynak, düzeltme bilgisi, tamamlama yüzdesi ve CV dosya bilgisi hiçbir zaman yoktur.
 */
export const profileViewSchema = z
  .object({
    userId: z.string(),
    displayName: z.string(),
    /** Doğrulanmış etkin üyelikler (bölüm adı + rol). */
    memberships: z.array(
      z
        .object({ departmentName: z.string(), role: z.enum(['STUDENT', 'ALUMNI', 'ACADEMIC']) })
        .strict(),
    ),
    headline: z.string().optional(),
    summary: z.string().optional(),
    city: z.string().optional(),
    goals: z.string().optional(),
    education: z.array(z.object(educationShape).strict()),
    positions: z.array(z.object(positionShape).strict()),
    languages: z.array(z.object(languageShape).strict()),
    certifications: z.array(z.object(certificationShape).strict()),
    skills: z.array(z.object({ label: z.string() }).strict()),
    /** Yalnız `SOCIAL_LINKS` alanı bu bakana açıksa. */
    socialLinks: z
      .array(z.object({ kind: z.enum(SOCIAL_LINK_KINDS), url: z.string() }).strict())
      .optional(),
    /** Yalnız `LINKEDIN` alanı açıksa. */
    linkedinUrl: z.string().optional(),
    /** Yalnız `EMAIL` / `PHONE` alanları açıksa (onaylı iletişim talebi ya da `MEMBERS` seviyesi). */
    email: z.string().optional(),
    phone: z.string().optional(),
    lastUpdatedAt: z.date().nullable(),
  })
  .strict();
export type ProfileView = z.infer<typeof profileViewSchema>;

export const getProfileSchema = z.object({ userId: id }).strict();
export type GetProfileInput = z.input<typeof getProfileSchema>;

/**
 * Beceri önerileri: yalnız kurallı (sözlük/derlenmiş) adlar, en fazla 20; başkasının serbest yazdığı beceri
 * ASLA önerilmez. Seçilen ad `addProfileSkill` ile eklenir.
 */
export const suggestSkillsSchema = z
  .object({
    query: z
      .string({ error: INVALID })
      .trim()
      .min(2, { error: INVALID })
      .max(80, { error: INVALID }),
  })
  .strict();
export type SuggestSkillsInput = z.input<typeof suggestSkillsSchema>;
export const skillSuggestionsSchema = z
  .object({ skills: z.array(z.object({ label: z.string() }).strict()).max(20) })
  .strict();
export type SkillSuggestions = z.infer<typeof skillSuggestionsSchema>;

export type ProfileEntryValues = {
  EDUCATION: ParsedEducation;
  POSITION: ParsedPosition;
  LANGUAGE: ParsedLanguage;
  CERTIFICATION: ParsedCertification;
};

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları
// ---------------------------------------------------------------------------------------------

const authErrors = ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED'] as const;
const memberErrors = [...authErrors, 'AUTH_NOT_VERIFIED', 'AUTH_FORBIDDEN'] as const;
const linkErrors = [
  'PROFILE_LINK_INVALID',
  'PROFILE_LINK_NOT_HTTPS',
  'PROFILE_LINK_HOST_NOT_ALLOWED',
] as const;

export const PROFILE_CONTENT_ACTION_ERRORS = {
  getMyProfile: [...authErrors],
  getProfile: [...memberErrors, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
  updateProfileBasics: [...authErrors, 'VALIDATION_INVALID', 'PROFILE_TEXT_PERSONAL_DATA'],
  setSocialLinks: [...authErrors, 'VALIDATION_INVALID', ...linkErrors],
  setLinkedinUrl: [...authErrors, 'VALIDATION_INVALID', ...linkErrors],
  saveProfileEntry: [
    ...authErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'PROFILE_LIMIT_REACHED',
    'PROFILE_TEXT_PERSONAL_DATA',
  ],
  deleteProfileEntry: [...authErrors, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
  addProfileSkill: [
    ...authErrors,
    'VALIDATION_INVALID',
    'PROFILE_LIMIT_REACHED',
    'PROFILE_TEXT_PERSONAL_DATA',
  ],
  removeProfileSkill: [...authErrors, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
  suggestSkills: [...authErrors, 'VALIDATION_INVALID'],
} as const satisfies Record<string, readonly ErrorCode[]>;

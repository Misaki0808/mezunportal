import 'server-only';

import { z } from 'zod';

/**
 * Ortam değişkenleri tek yerde, Zod ile doğrulanır. Kanonik liste burası ve `.env.example`'dır.
 * Yeni değişken eklenirse üçü birlikte güncellenir: bu dosya, `.env.example`, `docs/engineering.md`
 * "Yerel ortam". Sır için varsayılan gerçek değer yoktur; `NEXT_PUBLIC_*` kullanılmaz.
 */

// Boş string (`KEY=`) tanımsız sayılır; `.env.example`'daki boş satırlar yanlış değer olmasın.
const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

// Yalnız PostgreSQL adresleri kabul edilir. Hata yalnız değişken adını taşır; adres (kimlik bilgisi
// içerebilir) asla loga ya da mesaja girmez.
const postgresUrl = z.string().regex(/^postgres(ql)?:\/\/\S+$/);

const envSchema = z.object({
  /** Çalışma ortamı: yerel geliştirme, CI/test ya da canlı (P1-18). */
  APP_ENV: z.enum(['local', 'test', 'prod']),
  /** Uygulamanın dışarıdan görünen adresi; köken kontrolleri ve bağlantılar bundan türer. */
  APP_URL: z.url(),
  /** Derleme anındaki commit. Yerelde tanımsızdır; `/api/health` o zaman `local` döner. */
  GIT_SHA: optionalText,
  /** Uygulama veritabanı (worktree başına `mezun_<slug>`; docs/engineering.md "Yerel paralel çalışma"). */
  DATABASE_URL: postgresUrl,
  /** Yalnız veritabanlı testler için `mezun_<slug>_test`; uygulama okumaz. Adı `_test` ile bitmeli. */
  DATABASE_URL_TEST: z.preprocess(
    (value) => (value === '' ? undefined : value),
    postgresUrl.optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;

/** Geçersiz ya da eksik ortam. Mesaj yalnız değişken adlarını taşır, değerleri asla. */
export class EnvValidationError extends Error {
  readonly invalidKeys: readonly string[];

  constructor(invalidKeys: readonly string[]) {
    super(`Geçersiz ya da eksik ortam değişkeni: ${invalidKeys.join(', ')}`);
    this.name = 'EnvValidationError';
    this.invalidKeys = invalidKeys;
  }
}

export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '(kök)')));
    throw new EnvValidationError([...keys]);
  }
  return result.data;
}

export function getEnv(): Env {
  return parseEnv(process.env);
}

// ---------------------------------------------------------------------------------------------
// Kimlik doğrulama ve e-posta ortamı (P1-02). AYRI şema: yalnız kimlik/e-posta kodu `getAuthEnv()`
// çağırır; `/api/health` ve diğer sayfalar bu değişkenlere bağlı değildir (eksikse yalnız giriş kapanır).
// ---------------------------------------------------------------------------------------------

/**
 * `.env.example`'daki GENEL, sır olmayan geliştirme değeri: yalnız `local`/`test` ortamında kabul edilir.
 * `prod`'da bu değer (ya da `dev-only` ile başlayan herhangi bir değer) env doğrulamasını düşürür.
 */
export const INSECURE_DEV_AUTH_SECRET = 'dev-only-insecure-secret-for-local-and-test-0000';

// `Ad <adres@alan.adi>` ya da yalın adres. Satır sonu/başlık enjeksiyonuna izin verilmez.
const emailFromPattern = /^(?:[^<>@\r\n]+ )?<?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/;

const smtpSecure = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.enum(['true', 'false']).optional(),
);

const smtpFields = {
  /** SMTP sunucusu: yerelde Mailpit (127.0.0.1:1025); canlı sağlayıcı K-05. */
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_SECURE: smtpSecure,
  /** Kimlik doğrulamalı SMTP için ikisi birlikte verilir; Mailpit için boş. */
  SMTP_USER: optionalText,
  SMTP_PASSWORD: optionalText,
  EMAIL_FROM: z.string().regex(emailFromPattern),
};

function missingSmtpCredential(env: { SMTP_USER?: string; SMTP_PASSWORD?: string }) {
  if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
    return env.SMTP_USER === undefined ? 'SMTP_USER' : 'SMTP_PASSWORD';
  }
  return null;
}
const smtpEnvSchema = z
  .object({ APP_ENV: z.enum(['local', 'test', 'prod']), ...smtpFields })
  .superRefine((env, ctx) => {
    const missing = missingSmtpCredential(env);
    if (missing) ctx.addIssue({ code: 'custom', path: [missing], message: missing });
  });
export type SmtpEnv = Omit<z.infer<typeof smtpEnvSchema>, 'SMTP_SECURE'> & { SMTP_SECURE: boolean };
/** Worker'ın SMTP ayarı auth sırrına/LinkedIn'e bağımlı değildir. */
export function parseSmtpEnv(source: Readonly<Record<string, string | undefined>>): SmtpEnv {
  const result = smtpEnvSchema.safeParse(source);
  if (!result.success)
    throw new EnvValidationError([
      ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '(kök)'))),
    ]);
  return { ...result.data, SMTP_SECURE: result.data.SMTP_SECURE === 'true' };
}

const authEnvSchema = z
  .object({
    APP_ENV: z.enum(['local', 'test', 'prod']),
    APP_URL: z.url(),
    /** Better Auth çerez/jeton imza sırrı (≥ 32 karakter). Canlıda gerçek, rastgele bir değer olmalı. */
    BETTER_AUTH_SECRET: z.string().min(32),
    ...smtpFields,
    /** LinkedIn ile giriş: İKİSİ de yoksa sağlayıcı kapalıdır (LinkedIn uygulaması kullanıcıda, E maddesi). */
    LINKEDIN_CLIENT_ID: optionalText,
    LINKEDIN_CLIENT_SECRET: optionalText,
  })
  .superRefine((env, ctx) => {
    const issue = (path: string) => ctx.addIssue({ code: 'custom', path: [path], message: path });
    if ((env.LINKEDIN_CLIENT_ID === undefined) !== (env.LINKEDIN_CLIENT_SECRET === undefined)) {
      issue(env.LINKEDIN_CLIENT_ID === undefined ? 'LINKEDIN_CLIENT_ID' : 'LINKEDIN_CLIENT_SECRET');
    }
    const missing = missingSmtpCredential(env);
    if (missing) issue(missing);
    if (env.APP_ENV === 'prod' && env.BETTER_AUTH_SECRET.startsWith('dev-only')) {
      issue('BETTER_AUTH_SECRET');
    }
  });

export type AuthEnv = Omit<z.infer<typeof authEnvSchema>, 'SMTP_SECURE'> & { SMTP_SECURE: boolean };

export function parseAuthEnv(source: Readonly<Record<string, string | undefined>>): AuthEnv {
  const result = authEnvSchema.safeParse(source);
  if (!result.success) {
    const keys = new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '(kök)')));
    throw new EnvValidationError([...keys]);
  }
  return { ...result.data, SMTP_SECURE: result.data.SMTP_SECURE === 'true' };
}

export function getAuthEnv(): AuthEnv {
  return parseAuthEnv(process.env);
}

/** LinkedIn anahtarları verilmiş mi? Değilse sağlayıcı kapalıdır ve giriş ekranı düğmeyi göstermez. */
export function isLinkedInConfigured(
  env: Pick<AuthEnv, 'LINKEDIN_CLIENT_ID' | 'LINKEDIN_CLIENT_SECRET'>,
): boolean {
  return env.LINKEDIN_CLIENT_ID !== undefined && env.LINKEDIN_CLIENT_SECRET !== undefined;
}

// ---------------------------------------------------------------------------------------------
// Dosya depolama (P1-02 servis: mezun belgesi; CV P1-05'te aynı adaptörü kullanır)
// ---------------------------------------------------------------------------------------------

const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);

const storageEnvSchema = z.object({
  /** Yalnız yerel sürücü var; canlıda S3 uyumlu sürücü arayüz değişmeden eklenir (docs/architecture.md). */
  STORAGE_DRIVER: z.preprocess(blankToUndefined, z.enum(['local']).default('local')),
  /** Yerel sürücünün kökü; göreli yol çalışma dizinine (worktree köküne) göredir. Git dışı `.data/`. */
  STORAGE_LOCAL_PATH: z.preprocess(blankToUndefined, z.string().min(1).default('.data/files')),
});

export type StorageEnv = z.infer<typeof storageEnvSchema>;

export function parseStorageEnv(source: Readonly<Record<string, string | undefined>>): StorageEnv {
  const result = storageEnvSchema.safeParse(source);
  if (!result.success) {
    const keys = new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '(kök)')));
    throw new EnvValidationError([...keys]);
  }
  return result.data;
}

export function getStorageEnv(): StorageEnv {
  return parseStorageEnv(process.env);
}

// ---------------------------------------------------------------------------------------------
// CV ayrıştırma / LLM (P1-05)
// ---------------------------------------------------------------------------------------------

const llmEnvSchema = z
  .object({
    APP_ENV: z.enum(['local', 'test', 'prod']),
    /**
     * Sağlayıcı seçimi. BOŞSA CV ayrıştırma KAPALIDIR (ekranda sebebi gösterilir, elle giriş açık).
     * `fake`: deterministik sahte adaptör; yalnız `local`/`test` (canlıda env doğrulamasını düşürür).
     * Gerçek sağlayıcı K-04 cevaplanınca ayrı kartla eklenir; `LLM_API_KEY`/`LLM_MODEL` o zaman okunur.
     */
    LLM_PROVIDER: z.preprocess(blankToUndefined, z.enum(['fake']).optional()),
    LLM_API_KEY: optionalText,
    LLM_MODEL: optionalText,
    /** Kullanıcı başına günlük ayrıştırma sınırı (docs/security.md "Kötüye kullanım sınırları"). */
    CV_PARSE_DAILY_LIMIT: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().min(1).max(50).default(5),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'prod' && env.LLM_PROVIDER === 'fake') {
      ctx.addIssue({ code: 'custom', path: ['LLM_PROVIDER'], message: 'LLM_PROVIDER' });
    }
  });

export type LlmEnv = z.infer<typeof llmEnvSchema>;

export function parseLlmEnv(source: Readonly<Record<string, string | undefined>>): LlmEnv {
  const result = llmEnvSchema.safeParse(source);
  if (!result.success) {
    const keys = new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '(kök)')));
    throw new EnvValidationError([...keys]);
  }
  return result.data;
}

export function getLlmEnv(): LlmEnv {
  return parseLlmEnv(process.env);
}

// ---------------------------------------------------------------------------------------------
// Takvim / Meet (P1-10)
// ---------------------------------------------------------------------------------------------

const calendarEnvSchema = z
  .object({
    APP_ENV: z.enum(['local', 'test', 'prod']),
    /**
     * Sağlayıcı seçimi. BOŞSA takvim KAPALIDIR: online randevu yine onaylanır, mentor görüşme linkini elle ekler.
     * `fake`: deterministik sahte adaptör; yalnız `local`/`test` (canlıda env doğrulamasını düşürür). `google`: gerçek Google
     * Takvim/Meet adaptörü; `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` zorunludur ve sistem yöneticisi panelden bir kez
     * bağlar (yenileme jetonu veritabanında şifreli). Bağlanmadan `google` çalışır ama etkinlik açmaz: mentor linki elle ekler.
     */
    CALENDAR_PROVIDER: z.preprocess(blankToUndefined, z.enum(['fake', 'google']).optional()),
    /** Google OAuth Web istemcisi (Cloud Console). Sır: logda, kartta ve depoda yer almaz. */
    GOOGLE_CLIENT_ID: z.preprocess(blankToUndefined, z.string().min(1).optional()),
    GOOGLE_CLIENT_SECRET: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'prod' && env.CALENDAR_PROVIDER === 'fake') {
      ctx.addIssue({ code: 'custom', path: ['CALENDAR_PROVIDER'], message: 'CALENDAR_PROVIDER' });
    }
    if (env.CALENDAR_PROVIDER === 'google') {
      for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: key });
      }
    }
  });

export type CalendarEnv = z.infer<typeof calendarEnvSchema>;

export function parseCalendarEnv(
  source: Readonly<Record<string, string | undefined>>,
): CalendarEnv {
  const result = calendarEnvSchema.safeParse(source);
  if (!result.success) {
    const keys = new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '(kök)')));
    throw new EnvValidationError([...keys]);
  }
  return result.data;
}

export function getCalendarEnv(): CalendarEnv {
  return parseCalendarEnv(process.env);
}

// ---------------------------------------------------------------------------------------------
// Puan motoru (P1-16)
// ---------------------------------------------------------------------------------------------

const pointsEnvSchema = z.object({
  /**
   * Kurucu üye etiketi (K-10) pilot bitişi: `YYYY-MM-DD` (İstanbul günü, o günün sonu dahil). BOŞSA pilot AÇIKTIR
   * (etiket verilmeye devam eder); pilot bitince yönetici bu değeri doldurur. Geçmişi değiştirmez: etiket yayın anındaki
   * değere göre verilir, sonradan değer değişince verilmiş etiket geri alınmaz.
   */
  FOUNDING_MEMBER_UNTIL: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .transform((value, ctx) => {
        const end = new Date(`${value}T23:59:59.999+03:00`);
        // Var olmayan gün (30 Şubat) bazı motorlarda ertesi aya taşar: gün aynen geri okunmalı.
        const valid =
          !Number.isNaN(end.getTime()) &&
          new Date(end.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10) === value;
        if (!valid) {
          ctx.addIssue({ code: 'custom', message: 'FOUNDING_MEMBER_UNTIL' });
          return z.NEVER;
        }
        return end;
      })
      .optional(),
  ),
});

export type PointsEnv = z.infer<typeof pointsEnvSchema>;

export function parsePointsEnv(source: Readonly<Record<string, string | undefined>>): PointsEnv {
  const result = pointsEnvSchema.safeParse(source);
  if (!result.success) {
    const keys = new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '(kök)')));
    throw new EnvValidationError([...keys]);
  }
  return result.data;
}

export function getPointsEnv(): PointsEnv {
  return parsePointsEnv(process.env);
}

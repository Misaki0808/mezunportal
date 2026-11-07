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

const envSchema = z.object({
  /** Çalışma ortamı: yerel geliştirme, CI/test ya da canlı (P1-18). */
  APP_ENV: z.enum(['local', 'test', 'prod']),
  /** Uygulamanın dışarıdan görünen adresi; köken kontrolleri ve bağlantılar bundan türer. */
  APP_URL: z.url(),
  /** Derleme anındaki commit. Yerelde tanımsızdır; `/api/health` o zaman `local` döner. */
  GIT_SHA: optionalText,
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

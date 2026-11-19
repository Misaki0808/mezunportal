import type { z } from 'zod';

/**
 * Liste adreslerinin ortak kuralı: geçersiz parametre sessizce varsayılana düşer (hata ekranı yok), aralık dışı sayfa son
 * geçerli sayfaya çekilir. Önce bütün parametreler birlikte doğrulanır; olmazsa geçerli olanlar tek tek korunur; birlikte
 * yine geçersizse (ör. çelişen iki süzgeç) süzgeçsiz varsayılana dönülür.
 */
export function parseListFilters<S extends z.ZodType>(
  schema: S,
  candidate: Record<string, unknown>,
): z.output<S> {
  const full = schema.safeParse(candidate);
  if (full.success) return full.data;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidate))
    if (schema.safeParse({ [key]: value }).success) kept[key] = value;
  const partial = schema.safeParse(kept);
  return partial.success ? partial.data : schema.parse({});
}

/**
 * `page` şemanın üst sınırını aşıyorsa üst sınıra indirir: böylece "çok büyük sayfa" geçersiz sayılıp birinci sayfaya değil,
 * (sonuç sayısı bilindiğinde) son geçerli sayfaya çekilir. Tam sayı olmayan ya da 1'den küçük değerlere dokunmaz.
 */
export function capPage<T extends Record<string, unknown>>(candidate: T, max: number): T {
  const raw = candidate.page;
  if (raw === undefined || raw === null || raw === '') return candidate;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= max) return candidate;
  return { ...candidate, page: typeof raw === 'string' ? String(max) : max };
}

/** İstenen sayfa son sayfadan büyükse son sayfa numarası, aksi halde `null` (sonuç yoksa son sayfa 1'dir). */
export function lastPageIfPast(page: number, total: number, pageSize: number): number | null {
  if (page <= 1) return null;
  const last = Math.max(1, Math.ceil(total / pageSize));
  return page > last ? last : null;
}

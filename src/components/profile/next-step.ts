import type { ProfileCompletionField } from '@/contracts/profile-content';

/** "Sıradaki adım" tıklanınca ne olur: başka sayfaya git ya da bu sayfadaki bir alanı aç. */
export type NextStepTarget =
  { kind: 'link'; href: string } | { kind: 'basics' } | { kind: 'education' } | { kind: 'skills' };

export type NextStep = { field: ProfileCompletionField; target: NextStepTarget };

/**
 * Hangi eksik önce önerilir? Önce hesabı açan doğrulama, sonra profili dolduran içerik, en sonda tercihler.
 * CV listede yoktur: CV kartı ayrı ve her zaman görünür, yani zaten ikinci eylemdir.
 */
const ORDER: readonly { field: ProfileCompletionField; target: NextStepTarget }[] = [
  { field: 'MEMBERSHIP', target: { kind: 'link', href: '/dogrulama' } },
  { field: 'BASICS', target: { kind: 'basics' } },
  { field: 'EDUCATION', target: { kind: 'education' } },
  { field: 'SKILLS', target: { kind: 'skills' } },
  { field: 'INTERESTS', target: { kind: 'link', href: '/baslangic?duzenle=1' } },
  { field: 'GOALS', target: { kind: 'link', href: '/baslangic?duzenle=1' } },
  { field: 'MENTOR_PREFERENCE', target: { kind: 'link', href: '/baslangic?duzenle=1' } },
  { field: 'VISIBILITY', target: { kind: 'link', href: '/baslangic?duzenle=1' } },
];

/** Eksikler arasından kullanıcıya önerilecek tek sıradaki adım; yalnız CV eksikse ya da eksik yoksa `null`. */
export function pickNextStep(missing: readonly ProfileCompletionField[]): NextStep | null {
  for (const item of ORDER) {
    if (missing.includes(item.field)) return item;
  }
  return null;
}

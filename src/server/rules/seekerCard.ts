import {
  SEEKER_CARD_TAGS_MAX,
  SEEKER_HEADLINE_MAX,
  type SeekerClass,
} from '@/contracts/job-seekers';

import { computeClassStanding } from './classYear';
import { analyzeIdentity } from './faq';

/**
 * Aday kartı kuralları (saf; P2-06). Kartta yalnız beyaz liste alanları bulunur; başlık satırı serbest metindir, bu yüzden her sorguda
 * sahibin adı/e-postası/kimliği ve e-posta/telefon/kimlik numarası biçimine karşı denetlenir: şüpheli (engel ya da ad-önek uyarısı) ise
 * satır HİÇ gösterilmez (`null`). Kısa kesme yalnız uzunluğu sınırlar; kimlik denetimi kesmeden ÖNCE yapılır.
 */

const WHITESPACE = /\s+/g;

export function headlineForCard(
  headline: string | null,
  owner: { name: string; email: string; userId: string },
): string | null {
  const text = headline?.replace(WHITESPACE, ' ').trim();
  if (!text) return null;
  const finding = analyzeIdentity(text, [owner.name], [owner.email, owner.userId]);
  if (finding.blocked || finding.warnings.length > 0) return null;
  return text.length > SEEKER_HEADLINE_MAX ? `${text.slice(0, SEEKER_HEADLINE_MAX - 1)}…` : text;
}

/** Giriş yılından sınıf (D4). Henüz başlamamış (`NOT_STARTED`) kayıt bilinmeyen sayılır; kartta ayrı bir durum yoktur. */
export function classOfCard(
  input: { entryYear: number | null; classOffset: number },
  now: Date,
): SeekerClass {
  const standing = computeClassStanding(input, now);
  if (standing.kind === 'GRADE')
    return { kind: 'GRADE', grade: standing.grade, extended: standing.extended };
  if (standing.kind === 'PREPARATORY') return { kind: 'PREPARATORY' };
  return { kind: 'UNKNOWN' };
}

export function cardTags<T>(tags: readonly T[]): T[] {
  return tags.slice(0, SEEKER_CARD_TAGS_MAX);
}

import { createHash } from 'node:crypto';

import type {
  CvItemStatus,
  CvSection,
  ParsedProfile,
  ProfileField,
  ParsedCertification,
  ParsedEducation,
  ParsedLanguage,
  ParsedPosition,
} from '@/contracts/cv';

import { normalizeName } from './dictionary';

/**
 * CV farkı (saf): ayrıştırılmış CV ile mevcut profil kalemleri karşılaştırılır (docs/architecture.md "Onay
 * ekranı"). Üç sonuç: `NEW` (profilde yok), `CHANGED` (profilde var, CV farklı), `CONFLICT` (profilde var, CV
 * farklı VE kalem elle düzeltilmiş/elle girilmiş — sessizce ezilmez, ayrı gösterilir). Aynı olan kalem listelenmez.
 *
 * İlkeler: (1) CV'de OLMAYAN değer fark sayılmaz (eksik bilgi profildekini silmez); (2) kalem anahtarı yalnız
 * ÖNERİDEN türetilir, böylece aynı CV'de yeniden hesap aynı anahtarı verir; (3) CV içindeki yinelenen kalem tek
 * sayılır (ilki kalır); (4) hiçbir çıktı kimlik/rol/yetki içermez.
 */

export type PositionEntry = ParsedPosition & { companyId: string | null; titleId: string | null };
export type SkillEntry = { name: string; skillId: string | null };

export type ExistingEntry<T> = {
  id: string;
  value: T;
  /** Elle düzeltilmiş ya da elle girilmiş kalem: yeni CV bunu sessizce ezemez. */
  protected: boolean;
};

export type CvProposal = {
  profile: ParsedProfile;
  education: readonly ParsedEducation[];
  positions: readonly PositionEntry[];
  languages: readonly ParsedLanguage[];
  certifications: readonly ParsedCertification[];
  skills: readonly SkillEntry[];
};

export type CvSnapshot = {
  /** Profil satırı (yoksa `null`); `manualFields` kullanıcının elle düzenlediği alanlardır. */
  profile: { id: string; value: ParsedProfile; manualFields: readonly ProfileField[] } | null;
  education: readonly ExistingEntry<ParsedEducation>[];
  positions: readonly ExistingEntry<PositionEntry>[];
  languages: readonly ExistingEntry<ParsedLanguage>[];
  certifications: readonly ExistingEntry<ParsedCertification>[];
  skills: readonly ExistingEntry<SkillEntry>[];
};

type DiffBase<S extends CvSection, T> = {
  section: S;
  key: string;
  status: CvItemStatus;
  proposed: T;
  current: T | null;
  existingId: string | null;
  changedFields: string[];
};
export type DiffItem =
  | DiffBase<'PROFILE', ParsedProfile>
  | DiffBase<'EDUCATION', ParsedEducation>
  | DiffBase<'POSITION', PositionEntry>
  | DiffBase<'LANGUAGE', ParsedLanguage>
  | DiffBase<'CERTIFICATION', ParsedCertification>
  | DiffBase<'SKILL', SkillEntry>;

export type CvDiff = { items: DiffItem[]; unchangedCount: number };

const norm = (value: string | null | undefined) => (value ? normalizeName(value) : '');
const companyKey = (value: string) => normalizeName(value, 'COMPANY');

/** Kalem anahtarı: bölüm + kimlik dizgesinin özeti (kısa, URL güvenli, kullanıcı metnini sızdırmaz). */
function itemKey(section: CvSection, identity: string): string {
  return `${section}:${createHash('sha256').update(identity).digest('hex').slice(0, 20)}`;
}

type Section<T> = {
  section: CvSection;
  /** Aynı gerçek dünya kalemi mi? */
  same: (a: T, b: T) => boolean;
  /** Anahtarın türetildiği kimlik dizgesi (öneriden). */
  identity: (value: T) => string;
  /** Fark olan alan adları; yalnız önerinin dolu olduğu alanlar sayılır. */
  changed: (proposed: T, current: T) => string[];
};

function diffSection<T>(
  config: Section<T>,
  proposals: readonly T[],
  existing: readonly ExistingEntry<T>[],
): { items: DiffBase<CvSection, T>[]; unchanged: number } {
  const kept: T[] = [];
  for (const candidate of proposals) {
    if (!kept.some((other) => config.same(candidate, other))) kept.push(candidate);
  }
  const items: DiffBase<CvSection, T>[] = [];
  let unchanged = 0;
  for (const proposed of kept) {
    const key = itemKey(config.section, config.identity(proposed));
    const match = existing.find((entry) => config.same(proposed, entry.value));
    if (!match) {
      items.push({
        section: config.section,
        key,
        status: 'NEW',
        proposed,
        current: null,
        existingId: null,
        changedFields: [],
      });
      continue;
    }
    const changedFields = config.changed(proposed, match.value);
    if (changedFields.length === 0) {
      unchanged += 1;
      continue;
    }
    items.push({
      section: config.section,
      key,
      status: match.protected ? 'CONFLICT' : 'CHANGED',
      proposed,
      current: match.value,
      existingId: match.id,
      changedFields,
    });
  }
  return { items, unchanged };
}

/** Önerinin dolu olduğu alanlarda fark ara; `null` öneri "bilinmiyor" demektir. */
function differing<T extends object>(
  proposed: T,
  current: T,
  fields: readonly { name: keyof T & string; equal?: (a: T[keyof T], b: T[keyof T]) => boolean }[],
): string[] {
  const result: string[] = [];
  for (const { name, equal } of fields) {
    const next = proposed[name];
    if (next === null || next === undefined) continue;
    const same = equal ? equal(next, current[name]) : next === current[name];
    if (!same) result.push(name);
  }
  return result;
}

const sameText = (a: unknown, b: unknown) => norm(a as string) === norm(b as string);

const positionConfig: Section<PositionEntry> = {
  section: 'POSITION',
  same: (a, b) => {
    const sameCompany =
      (a.companyId !== null && a.companyId === b.companyId) ||
      companyKey(a.company) === companyKey(b.company);
    if (!sameCompany) return false;
    // İki tarafta da başlangıç varsa başlangıç belirler (aynı yerde yeniden işe giriş ayrı kalemdir).
    if (a.startDate && b.startDate) return a.startDate === b.startDate;
    return norm(a.title) === norm(b.title);
  },
  identity: (value) =>
    `${companyKey(value.company)}|${value.startDate ?? `T:${norm(value.title)}`}`,
  changed: (proposed, current) => [
    ...differing(proposed, current, [
      { name: 'title', equal: sameText },
      { name: 'employmentType' },
      { name: 'startDate' },
      { name: 'endDate' },
      { name: 'description', equal: sameText },
    ]),
    // Süren/biten durumu: CV "devam ediyor" ya da bitiş tarihi veriyorsa mevcut durumla kıyaslanır.
    ...(proposed.isCurrent !== current.isCurrent && (proposed.isCurrent || proposed.endDate)
      ? ['isCurrent']
      : []),
  ],
};

const educationConfig: Section<ParsedEducation> = {
  section: 'EDUCATION',
  same: (a, b) => {
    if (norm(a.institution) !== norm(b.institution)) return false;
    if (a.level && b.level) return a.level === b.level;
    if (a.startDate && b.startDate) return a.startDate.slice(0, 4) === b.startDate.slice(0, 4);
    return true;
  },
  identity: (value) =>
    `${norm(value.institution)}|${value.level ?? `Y:${value.startDate?.slice(0, 4) ?? ''}`}`,
  changed: (proposed, current) => [
    ...differing(proposed, current, [
      { name: 'level' },
      { name: 'fieldOfStudy', equal: sameText },
      { name: 'startDate' },
      { name: 'endDate' },
    ]),
    ...(proposed.isCurrent !== current.isCurrent && (proposed.isCurrent || proposed.endDate)
      ? ['isCurrent']
      : []),
  ],
};

const languageConfig: Section<ParsedLanguage> = {
  section: 'LANGUAGE',
  same: (a, b) => norm(a.name) === norm(b.name),
  identity: (value) => norm(value.name),
  changed: (proposed, current) => differing(proposed, current, [{ name: 'level' }]),
};

const certificationConfig: Section<ParsedCertification> = {
  section: 'CERTIFICATION',
  same: (a, b) => norm(a.name) === norm(b.name),
  identity: (value) => norm(value.name),
  changed: (proposed, current) =>
    differing(proposed, current, [{ name: 'issuer', equal: sameText }, { name: 'issuedDate' }]),
};

const skillConfig: Section<SkillEntry> = {
  section: 'SKILL',
  same: (a, b) => norm(a.name) === norm(b.name),
  identity: (value) => norm(value.name),
  changed: () => [],
};

const PROFILE_FIELD_NAMES = ['headline', 'summary', 'city'] as const;

/**
 * Profil üst alanları tek kalemdir. CV'de OLMAYAN alan fark sayılmaz; profilde boş olan alan YENİ, dolu ve farklı
 * olan DEĞİŞEN, dolu + elle düzenlenmiş + farklı olan ÇAKIŞANdır. Kalem durumu en ağır alanın durumudur.
 */
function diffProfile(
  proposed: ParsedProfile,
  existing: CvSnapshot['profile'],
): { item: DiffItem | null; unchanged: number } {
  const touched = PROFILE_FIELD_NAMES.filter((field) => proposed[field] !== null);
  if (touched.length === 0) return { item: null, unchanged: 0 };
  const changedFields: string[] = [];
  let conflict = false;
  let changed = false;
  for (const field of touched) {
    const current = existing?.value[field] ?? null;
    if (current !== null && norm(current) === norm(proposed[field])) continue;
    changedFields.push(field);
    if (current !== null) {
      changed = true;
      if (existing?.manualFields.includes(field)) conflict = true;
    }
  }
  if (changedFields.length === 0) return { item: null, unchanged: 1 };
  const status: CvItemStatus = conflict ? 'CONFLICT' : changed ? 'CHANGED' : 'NEW';
  return {
    item: {
      section: 'PROFILE',
      key: itemKey('PROFILE', 'profile'),
      status,
      proposed,
      current: existing ? existing.value : null,
      existingId: existing ? existing.id : null,
      changedFields,
    },
    unchanged: 0,
  };
}

export function computeCvDiff(proposal: CvProposal, snapshot: CvSnapshot): CvDiff {
  const profile = diffProfile(proposal.profile, snapshot.profile);
  const parts: { items: readonly unknown[]; unchanged: number }[] = [
    { items: profile.item ? [profile.item] : [], unchanged: profile.unchanged },
    diffSection(educationConfig, proposal.education, snapshot.education),
    diffSection(positionConfig, proposal.positions, snapshot.positions),
    diffSection(languageConfig, proposal.languages, snapshot.languages),
    diffSection(certificationConfig, proposal.certifications, snapshot.certifications),
    diffSection(skillConfig, proposal.skills, snapshot.skills),
  ];
  return {
    // Her bölümün kalemleri kendi `section` değeriyle üretilir; birleşim türü burada daraltılır.
    items: parts.flatMap((part) => part.items) as DiffItem[],
    unchangedCount: parts.reduce((sum, part) => sum + part.unchanged, 0),
  };
}

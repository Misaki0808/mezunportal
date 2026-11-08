import 'server-only';

import { Prisma } from '@/generated/prisma/client';

import {
  DICTIONARY_MATCH_THRESHOLD,
  normalizeName,
  type DictionaryKindName,
} from '../rules/dictionary';
import type { Tx } from './cv-shared';

/**
 * Sözlük eşleme (docs/architecture.md "Standartlaştırma"): ad normalleştirilir; tam ad, takma ad ya da `pg_trgm`
 * benzerliği eşiği geçen en iyi kayıt eşleşir. Eşik altı değer eşleşmez (ham kalır). 4 karakterden kısa
 * adlarda bulanık eşleme KAPALIDIR (`go`, `r`, `c#` gibi adlar yanlış eşleşmesin).
 */
export type DictionaryMatch = { id: string; name: string; sectorId?: string | null };

type MatchKind = Exclude<DictionaryKindName, 'SECTOR'>;
// Tablo adı yalnız bu sabit eşlemeden gelir (kullanıcı girdisi SQL tanımlayıcısına girmez).
const TABLES: Record<MatchKind, Prisma.Sql> = {
  COMPANY: Prisma.raw('"Company"'),
  TITLE: Prisma.raw('"Title"'),
  SKILL: Prisma.raw('"Skill"'),
};
const FUZZY_MIN_LENGTH = 4;

export async function matchDictionaryName(
  tx: Tx,
  kind: MatchKind,
  rawName: string,
): Promise<DictionaryMatch | null> {
  const normalized = normalizeName(rawName, kind);
  if (normalized === '') return null;
  const table = TABLES[kind];
  const sector = kind === 'COMPANY' ? Prisma.raw('"sectorId"') : Prisma.raw('NULL::text');
  const fuzzy = normalized.length >= FUZZY_MIN_LENGTH;
  const rows = await tx.$queryRaw<
    { id: string; name: string; sectorId: string | null; score: number }[]
  >(Prisma.sql`
    SELECT "id", "name", ${sector} AS "sectorId",
      CASE WHEN "normalizedName" = ${normalized} OR ${normalized} = ANY("aliases") THEN 1.0::float8
           ELSE similarity("normalizedName", ${normalized})::float8 END AS "score"
    FROM ${table}
    WHERE "normalizedName" = ${normalized} OR ${normalized} = ANY("aliases")
       ${fuzzy ? Prisma.sql`OR "normalizedName" % ${normalized}` : Prisma.empty}
    ORDER BY "score" DESC, "normalizedName" ASC
    LIMIT 1`);
  const best = rows[0];
  if (!best) return null;
  if (best.score < DICTIONARY_MATCH_THRESHOLD && best.score < 1) return null;
  return { id: best.id, name: best.name, sectorId: best.sectorId };
}

export type DictionaryLookup = {
  company: Map<string, DictionaryMatch | null>;
  title: Map<string, DictionaryMatch | null>;
  skill: Map<string, DictionaryMatch | null>;
};

const lookupKey = (kind: MatchKind, value: string) => normalizeName(value, kind);

/** Bir CV'deki (tekilleştirilmiş) şirket/unvan/beceri adlarını sözlükle eşler. */
export async function buildDictionaryLookup(
  tx: Tx,
  names: { companies: Iterable<string>; titles: Iterable<string>; skills: Iterable<string> },
): Promise<DictionaryLookup> {
  const lookup: DictionaryLookup = { company: new Map(), title: new Map(), skill: new Map() };
  const fill = async (
    kind: MatchKind,
    target: Map<string, DictionaryMatch | null>,
    list: Iterable<string>,
  ) => {
    for (const raw of list) {
      const key = lookupKey(kind, raw);
      if (key === '' || target.has(key)) continue;
      target.set(key, await matchDictionaryName(tx, kind, raw));
    }
  };
  await fill('COMPANY', lookup.company, names.companies);
  await fill('TITLE', lookup.title, names.titles);
  await fill('SKILL', lookup.skill, names.skills);
  return lookup;
}

export const lookupMatch = (
  map: Map<string, DictionaryMatch | null>,
  kind: MatchKind,
  raw: string,
): DictionaryMatch | null => map.get(lookupKey(kind, raw)) ?? null;

/**
 * Kullanıcının ONAYLADIĞI ama sözlükte eşleşmeyen değeri yönetici kuyruğuna yazar/sayar. Kişi bilgisi yoktur
 * (yalnız değer); reddedilen/atılan CV değerleri kuyruğa hiç girmez.
 */
export async function recordUnmatched(tx: Tx, kind: MatchKind, rawValue: string): Promise<void> {
  const normalizedValue = normalizeName(rawValue, kind);
  if (normalizedValue === '') return;
  await tx.unmatchedValue.upsert({
    where: { kind_normalizedValue: { kind, normalizedValue } },
    create: { kind, rawValue: rawValue.slice(0, 200), normalizedValue },
    update: { count: { increment: 1 } },
  });
}

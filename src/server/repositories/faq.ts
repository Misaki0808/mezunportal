import 'server-only';

import { Prisma, type PrismaClient } from '@/generated/prisma/client';

import { FUZZY_MIN_LENGTH, WORD_SIMILARITY_THRESHOLD, asciiFold, tokensOf } from './search';

/**
 * SSS arama deposu — HAM SQL YALNIZ BURADADIR (docs/architecture.md "Arama"). Deneyim aramasıyla aynı Türkçe tam metin
 * (`searchVector`) + `pg_trgm` (`searchKeys`) düzeni. Güvenlik ilkeleri:
 *  - Yalnız arayanın doğrulanmış üniversitelerindeki bölümlerde yazılmış talebin yayınlanmış SSS'si (K-07).
 *  - Çıktı sütunları yalnız soru, cevap, yayın tarihi: kaynak talep, soran, cevap veren ve moderatör HİÇ okunmaz.
 *  - Kullanıcı girdisi yalnız bağlı parametredir; sorgu metni loglanmaz.
 */

export type FaqRow = { id: string; question: string; answer: string; publishedAt: Date };

const FROM = Prisma.sql`FROM "FaqItem" i
  JOIN "Department" d ON d."id" = i."departmentIdAtWrite"
  JOIN "Faculty" f ON f."id" = d."facultyId"`;

/** Benzer soru eşiği: tam soru üzerinde `similarity` (pg_trgm) bu değer ve üstü; ya da bütün sözcükler tam metinde eşleşir. */
export const FAQ_SIMILARITY_THRESHOLD = 0.35;

export async function searchFaqRows(
  db: Pick<PrismaClient, '$transaction'>,
  query: { universityIds: readonly string[]; q?: string; page: number; pageSize: number },
): Promise<{ rows: FaqRow[]; total: number }> {
  if (query.universityIds.length === 0) return { rows: [], total: 0 };
  const tokens = tokensOf(query.q);
  const hasText = tokens.length > 0;
  // Metin verildi ama harf/rakam içermiyor: hiçbir şeyle eşleşmez (süzgeç sessizce düşmez).
  const emptyText = query.q !== undefined && query.q.trim() !== '' && !hasText;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`f."universityId" = ANY(${[...query.universityIds]}::text[])`,
  ];
  if (emptyText) conditions.push(Prisma.sql`FALSE`);
  const rankQuery = hasText
    ? Prisma.join(
        tokens.map(
          (token) =>
            Prisma.sql`(plainto_tsquery('turkish', tr_lower(${token})) || plainto_tsquery('simple', tr_ascii(${token})))`,
        ),
        ' || ',
      )
    : Prisma.empty;
  tokens.forEach((token) => {
    const turkish = Prisma.sql`plainto_tsquery('turkish', tr_lower(${token}))`;
    const simple = Prisma.sql`plainto_tsquery('simple', tr_ascii(${token}))`;
    const fuzzy =
      token.length >= FUZZY_MIN_LENGTH
        ? Prisma.sql` OR tr_ascii(${token}) <% i."searchKeys"`
        : Prisma.empty;
    conditions.push(
      Prisma.sql`(numnode(${turkish}) = 0 OR i."searchVector" @@ ${turkish} OR i."searchVector" @@ ${simple}${fuzzy})`,
    );
  });
  const where = Prisma.join(conditions, ' AND ');
  const rank = hasText
    ? Prisma.sql`(ts_rank_cd(i."searchVector", ${rankQuery}) + word_similarity(tr_ascii(${tokens.join(' ')}), i."searchKeys")) DESC,`
    : Prisma.empty;
  const offset = (query.page - 1) * query.pageSize;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${WORD_SIMILARITY_THRESHOLD}, true)`;
    const rows = await tx.$queryRaw<(FaqRow & { total: bigint })[]>(Prisma.sql`
      SELECT i."id", i."question", i."answer", i."publishedAt", count(*) OVER() AS "total"
      ${FROM}
      WHERE ${where}
      ORDER BY ${rank} i."publishedAt" DESC, i."id" DESC
      LIMIT ${query.pageSize} OFFSET ${offset}`);
    let total = rows[0] ? Number(rows[0].total) : 0;
    if (rows.length === 0 && offset > 0) {
      const counted = await tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT count(*) AS "total" ${FROM} WHERE ${where}`,
      );
      total = Number(counted[0]?.total ?? 0);
    }
    return {
      rows: rows.map(({ total: _total, ...row }) => {
        void _total;
        return row;
      }),
      total,
    };
  });
}

/** Bir SSS'yi görünürlük kapsamıyla getirir (kapsam dışı ya da yok → `null`; varlık sızmaz). */
export async function findFaqRow(
  db: Pick<PrismaClient, '$queryRaw'>,
  universityIds: readonly string[],
  id: string,
): Promise<FaqRow | null> {
  if (universityIds.length === 0) return null;
  const rows = await db.$queryRaw<FaqRow[]>(Prisma.sql`
    SELECT i."id", i."question", i."answer", i."publishedAt" ${FROM}
    WHERE i."id" = ${id} AND f."universityId" = ANY(${[...universityIds]}::text[])`);
  return rows[0] ?? null;
}

/**
 * Yazılan soruya benzer yayınlanmış SSS'ler (en çok `limit`): tam soru için `similarity` ≥ eşik YA DA bütün anlamlı
 * sözcükler tam metinde eşleşir. Sıralama benzerlik azalan, sonra en yeni. Gönderim kapısı da bu işlevi kullanır.
 */
export async function similarFaqRows(
  db: Pick<PrismaClient, '$queryRaw'>,
  query: { universityIds: readonly string[]; text: string; limit: number },
): Promise<{ id: string; question: string }[]> {
  if (query.universityIds.length === 0) return [];
  const folded = asciiFold(query.text);
  return db.$queryRaw<{ id: string; question: string }[]>(Prisma.sql`
    SELECT i."id", i."question" ${FROM}
    WHERE f."universityId" = ANY(${[...query.universityIds]}::text[])
      AND (
        similarity(tr_ascii(${folded}), i."searchKeys") >= ${FAQ_SIMILARITY_THRESHOLD}
        OR (numnode(plainto_tsquery('turkish', tr_lower(${query.text}))) > 0
            AND i."searchVector" @@ plainto_tsquery('turkish', tr_lower(${query.text})))
      )
    ORDER BY similarity(tr_ascii(${folded}), i."searchKeys") DESC, i."publishedAt" DESC, i."id" DESC
    LIMIT ${query.limit}`);
}

import 'server-only';

import { Prisma, type PrismaClient } from '@/generated/prisma/client';

/**
 * Deneyim arama deposu — HAM SQL YALNIZ BURADADIR (docs/architecture.md "Arama"). Türkçe tam metin
 * (`searchVector`, üretilmiş sütun) + `pg_trgm` yazım hatası toleransı (`searchKeys`).
 *
 * Güvenlik ilkeleri (sorgu değişirse testler düşer):
 *  - Yalnız `PUBLISHED` ve arayanın doğrulanmış üniversitelerindeki bölümlerde yazılmış deneyimler (K-07).
 *  - Anonim deneyimde yazar sütunları HİÇ okunmaz; yazarı silinmiş/askıdaki/bağı kopmuş deneyim yazarsız döner.
 *  - Kullanıcı girdisi yalnız bağlı parametredir (SQL parçası yok); LIKE joker karakterleri kaçırılır.
 *  - Sorgu metni loglanmaz.
 */

export type SearchQuery = {
  /** Arayanın doğrulanmış etkin üyeliklerinin üniversiteleri (K-07). Boşsa sonuç yoktur. */
  universityIds: readonly string[];
  q?: string;
  types?: readonly string[];
  company?: string;
  sectorId?: string;
  channels?: readonly string[];
  termYear?: number;
  termSeason?: string;
  pay?: string;
  sort: 'RELEVANCE' | 'NEWEST';
  page: number;
  pageSize: number;
};

export type SearchRow = {
  id: string;
  type: string;
  organizationName: string | null;
  departmentName: string;
  city: string | null;
  country: string | null;
  termYear: number | null;
  termSeason: string | null;
  durationWeeks: number | null;
  pay: string | null;
  applicationChannel: string | null;
  snippet: string;
  publishedAt: Date;
  /** Yazar bilgisi yalnız ADLI deneyimde okunur (anonimde hiç okunmaz); görünürlük kuralı serviste. */
  authorId: string | null;
  authorName: string | null;
  authorDeletedAt: Date | null;
  authorBanned: boolean | null;
  authorBanExpires: Date | null;
};

/** Yazım hatası eşiği (0–1): "Istnbul" → "istanbul". */
const WORD_SIMILARITY_THRESHOLD = '0.45';

const withoutTotal = (row: SearchRow & { total: bigint }): SearchRow => {
  const { total, ...rest } = row;
  void total;
  return rest;
};

/** Yazım hatası toleransı bu uzunluktan kısa sözcüklerde kapalıdır (“bir”, “ve” gibi sözcükler her şeye benzemesin). */
const FUZZY_MIN_LENGTH = 4;
const MAX_TOKENS = 8;

/** Sorgudan harf/rakam sözcükleri (tırnak, işleç ve noktalama atılır); en fazla `MAX_TOKENS`. */
function tokensOf(text: string | undefined): string[] {
  return (text?.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_TOKENS);
}

/** `tr_ascii` SQL işlevinin JS karşılığı (LIKE kalıbı için; ikisi aynı katlamayı yapar). */
function asciiFold(value: string): string {
  return value
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/[ıçğöşüâîû]/g, (char) => 'icgosuaiu'['ıçğöşüâîû'.indexOf(char)] ?? char);
}

export async function searchExperienceRows(
  db: Pick<PrismaClient, '$transaction'>,
  query: SearchQuery,
): Promise<{ rows: SearchRow[]; total: number }> {
  if (query.universityIds.length === 0) return { rows: [], total: 0 };

  const tokens = tokensOf(query.q);
  const hasText = tokens.length > 0;
  // Metin verildi ama harf/rakam içermiyor (“(((”, “%%”): hiçbir şeyle eşleşmez; süzgeç sessizce düşmez.
  const emptyText = query.q !== undefined && query.q.trim() !== '' && !hasText;
  const emptyCompany = query.company !== undefined && tokensOf(query.company).length === 0;
  // Sıralama için bütün sözcüklerin birleşik sorgusu (VEYA); eşleşme koşulu ise sözcük başına aşağıdadır.
  const tokenQueries = tokens.map(
    (token) =>
      Prisma.sql`(plainto_tsquery('turkish', tr_lower(${token})) || plainto_tsquery('simple', tr_ascii(${token})))`,
  );
  const rankQuery = hasText ? Prisma.join(tokenQueries, ' || ') : Prisma.empty;
  const asciiText = Prisma.sql`tr_ascii(${tokens.join(' ')})`;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`e."status" = 'PUBLISHED'`,
    Prisma.sql`f."universityId" = ANY(${[...query.universityIds]}::text[])`,
  ];
  if (emptyText || emptyCompany) conditions.push(Prisma.sql`FALSE`);
  // Her sözcük: Türkçe gövdeli ya da ASCII katlanmış tam metin eşleşmesi VEYA (4+ harfli sözcükte) yazım hatası
  // toleranslı benzerlik. Sözcükler VE ile birleşir; yalnız durak sözcük olan (boş sorgu) sözcük atlanır.
  tokens.forEach((token, index) => {
    const turkish = Prisma.sql`plainto_tsquery('turkish', tr_lower(${token}))`;
    const simple = Prisma.sql`plainto_tsquery('simple', tr_ascii(${token}))`;
    const fuzzy =
      token.length >= FUZZY_MIN_LENGTH
        ? Prisma.sql` OR tr_ascii(${token}) <% e."searchKeys"`
        : Prisma.empty;
    conditions.push(
      Prisma.sql`(numnode(${turkish}) = 0 OR e."searchVector" @@ ${turkish} OR e."searchVector" @@ ${simple}${fuzzy})`,
    );
    void index;
  });
  if (query.types && query.types.length > 0) {
    conditions.push(Prisma.sql`e."type"::text = ANY(${[...query.types]}::text[])`);
  }
  if (query.channels && query.channels.length > 0) {
    conditions.push(Prisma.sql`e."applicationChannel"::text = ANY(${[...query.channels]}::text[])`);
  }
  // Sözcükler yalnız harf/rakamdır (`tokensOf`): LIKE joker karakteri (% _ \\) kalıba hiç giremez.
  for (const word of tokensOf(query.company)) {
    const contains = Prisma.sql`tr_ascii(coalesce(e."organizationName", '')) LIKE ${`%${asciiFold(word)}%`}`;
    conditions.push(
      word.length >= FUZZY_MIN_LENGTH
        ? Prisma.sql`(${contains} OR word_similarity(tr_ascii(${word}), tr_ascii(coalesce(e."organizationName", ''))) >= 0.6)`
        : contains,
    );
  }
  if (query.sectorId) {
    conditions.push(
      Prisma.sql`e."companyId" IN (SELECT c."id" FROM "Company" c WHERE c."sectorId" = ${query.sectorId})`,
    );
  }
  if (query.termYear !== undefined) conditions.push(Prisma.sql`e."termYear" = ${query.termYear}`);
  if (query.termSeason) conditions.push(Prisma.sql`e."termSeason"::text = ${query.termSeason}`);
  if (query.pay) conditions.push(Prisma.sql`e."pay"::text = ${query.pay}`);

  const where = Prisma.join(conditions, ' AND ');
  const rank =
    hasText && query.sort === 'RELEVANCE'
      ? Prisma.sql`(ts_rank_cd(e."searchVector", ${rankQuery}) + word_similarity(${asciiText}, e."searchKeys")) DESC,`
      : Prisma.empty;
  const offset = (query.page - 1) * query.pageSize;

  return db.$transaction(async (tx) => {
    // `<%` işleci bu eşiği okur; yalnız bu işlem için.
    await tx.$queryRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${WORD_SIMILARITY_THRESHOLD}, true)`;
    const rows = await tx.$queryRaw<(SearchRow & { total: bigint })[]>(Prisma.sql`
      SELECT e."id", e."type"::text AS "type", e."organizationName", d."name" AS "departmentName",
             e."city", e."country", e."termYear", e."termSeason"::text AS "termSeason", e."durationWeeks",
             e."pay"::text AS "pay", e."applicationChannel"::text AS "applicationChannel",
             left(e."whatLearned", 220) AS "snippet", e."publishedAt",
             named_author."id" AS "authorId", named_author."name" AS "authorName",
             named_author."deletedAt" AS "authorDeletedAt", named_author."banned" AS "authorBanned",
             named_author."banExpires" AS "authorBanExpires",
             count(*) OVER() AS "total"
      FROM "Experience" e
      JOIN "Department" d ON d."id" = e."departmentIdAtWrite"
      JOIN "Faculty" f ON f."id" = d."facultyId"
      LEFT JOIN LATERAL (
        SELECT u."id", u."name", u."deletedAt", u."banned", u."banExpires" FROM "User" u
        WHERE NOT e."isAnonymous" AND u."id" = e."authorId"
      ) named_author ON TRUE
      WHERE ${where}
      ORDER BY ${rank} e."publishedAt" DESC, e."id" DESC
      LIMIT ${query.pageSize} OFFSET ${offset}`);
    let total = rows[0] ? Number(rows[0].total) : 0;
    if (rows.length === 0 && offset > 0) {
      // Son sayfanın ötesi: toplamı ayrıca say (ekran son sayfaya yönlendirsin).
      const counted = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT count(*) AS "total" FROM "Experience" e
        JOIN "Department" d ON d."id" = e."departmentIdAtWrite"
        JOIN "Faculty" f ON f."id" = d."facultyId"
        WHERE ${where}`);
      total = Number(counted[0]?.total ?? 0);
    }
    return { rows: rows.map(withoutTotal), total };
  });
}

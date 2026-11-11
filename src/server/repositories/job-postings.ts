import 'server-only';

import { Prisma, type PrismaClient } from '@/generated/prisma/client';

import { FUZZY_MIN_LENGTH, WORD_SIMILARITY_THRESHOLD, tokensOf } from './search';
import { istanbulDay } from '../rules/jobPosting';

/**
 * İlan arama deposu — HAM SQL YALNIZ BURADADIR (docs/architecture.md "Arama"). Deneyim/SSS aramasıyla aynı Türkçe tam metin
 * (`searchVector`) + `pg_trgm` (`searchKeys`) düzeni. Güvenlik ilkeleri:
 *  - Yalnız arayanın doğrulanmış üniversitelerindeki bölümlerde yazılmış, YAYINDA ve süresi dolmamış (son gün ≥ bugün) ilan (K-07).
 *  - Çıktı sütunları okuyucu kartı/detayı içindir: yazar adı/e-postası HİÇ okunmaz; yazar yalnız rol türü için ve
 *    `CONTACT_REQUEST` ilanında iletişim talebi bağlantısı için (`authorId`) alınır.
 *  - `applyUrl` yalnız `URL` yöntemli ilanda döner; kullanıcı girdisi yalnız bağlı parametredir; sorgu metni loglanmaz.
 */

export type JobPostingRow = {
  id: string;
  kind: 'INTERNSHIP' | 'JOB';
  title: string;
  organizationName: string;
  companyId: string | null;
  location: string | null;
  isRemote: boolean;
  deadlineOn: string;
  applyMethod: 'URL' | 'CONTACT_REQUEST';
  publishedAt: Date;
  authorKind: 'ALUMNI' | 'ACADEMIC';
  targetDepartments: { id: string; name: string }[];
};
export type JobPostingDetailRow = JobPostingRow & {
  description: string;
  applyUrl: string | null;
  authorId: string | null;
};

const FROM = Prisma.sql`FROM "JobPosting" i
  JOIN "Department" d ON d."id" = i."departmentIdAtWrite"
  JOIN "Faculty" f ON f."id" = d."facultyId"`;

const CARD_COLUMNS = Prisma.sql`i."id", i."kind", i."title", i."organizationName", i."companyId", i."location", i."isRemote",
  to_char(i."deadlineOn", 'YYYY-MM-DD') AS "deadlineOn", i."applyMethod", i."publishedAt",
  COALESCE((SELECT m."role" FROM "Membership" m
    WHERE m."userId" = i."authorId" AND m."endedAt" IS NULL AND m."verificationStatus" = 'VERIFIED'
      AND m."role" IN ('ALUMNI', 'ACADEMIC')
    ORDER BY (m."departmentId" = i."departmentIdAtWrite") DESC, (m."role" = 'ACADEMIC') DESC LIMIT 1), 'ALUMNI') AS "authorKind",
  COALESCE((SELECT json_agg(json_build_object('id', t."departmentId", 'name', td."name") ORDER BY td."name", t."departmentId")
    FROM "JobPostingDepartment" t JOIN "Department" td ON td."id" = t."departmentId"
    WHERE t."postingId" = i."id"), '[]'::json) AS "targetDepartments"`;

/** Okuyucuya açık ilan koşulu: yayında, süresi dolmamış, arayanın üniversitelerinde. */
/** Bütün ilan okuma ve eşleşme yüzeylerinin paylaştığı sunucu görünürlük kapısı. */
function visiblePostingWhere(today: string, now: Date): Prisma.Sql[] {
  return [
    Prisma.sql`i."status" = 'PUBLISHED'`,
    Prisma.sql`i."deadlineOn" >= ${today}::date`,
    // P2-14 (performans): ilişkili EXISTS/skaler alt sorgular yerine KÜME üyeliği. Anlamları aynıdır; fark, planlayıcının her ilan için
    // iç içe döngü kurmak yerine bir kez karma (hash) yarı birleştirme yapabilmesidir (1.000 yayında ilanda 1,2 sn → onlarca ms).
    Prisma.sql`i."authorId" IN (SELECT u."id" FROM "User" u WHERE u."deletedAt" IS NULL
      AND (NOT u."banned" OR (u."banExpires" IS NOT NULL AND u."banExpires" <= ${now})))`,
    Prisma.sql`(i."authorId", i."departmentIdAtWrite") IN (SELECT m."userId", m."departmentId" FROM "Membership" m
      WHERE m."role" IN ('ALUMNI', 'ACADEMIC') AND m."verificationStatus" = 'VERIFIED' AND m."endedAt" IS NULL)`,
    Prisma.sql`i."id" IN (SELECT jt."postingId" FROM "JobPostingDepartment" jt
      GROUP BY jt."postingId" HAVING count(*) BETWEEN 1 AND 10)`,
    Prisma.sql`NOT EXISTS (SELECT 1 FROM "JobPostingDepartment" jt
      JOIN "Department" target ON target."id" = jt."departmentId"
      JOIN "Faculty" target_faculty ON target_faculty."id" = target."facultyId"
      WHERE jt."postingId" = i."id" AND target_faculty."universityId" <> f."universityId")`,
  ];
}

/** İç servislere, verilen kimliklerden yalnız hâlâ görünenleri döndürür; okuyucu kapsamı çağıranda ayrıca doğrulanır. */
export async function visibleJobPostingIds(
  db: Pick<PrismaClient, '$queryRaw'>,
  ids: readonly string[],
  now: Date,
): Promise<string[]> {
  if (!ids.length) return [];
  const where = Prisma.join(
    [...visiblePostingWhere(istanbulDay(now), now), Prisma.sql`i."id" = ANY(${[...ids]}::text[])`],
    ' AND ',
  );
  const rows = await db.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT i."id" ${FROM} WHERE ${where}`,
  );
  return rows.map((row) => row.id);
}

function visible(universityIds: readonly string[], today: string, now: Date): Prisma.Sql[] {
  return [
    ...visiblePostingWhere(today, now),
    Prisma.sql`f."universityId" = ANY(${[...universityIds]}::text[])`,
  ];
}

export type JobSearchQuery = {
  universityIds: readonly string[];
  /** İstanbul bugünü `YYYY-MM-DD`. */
  today: string;
  now: Date;
  q?: string;
  departmentId?: string;
  kind?: 'INTERNSHIP' | 'JOB';
  companyId?: string;
  /** Sözlüğe bağlı olmayan kurum adı (tam eşleşme; ASCII katlama). `companyId` ile birlikte kullanılmaz. */
  organizationName?: string;
  /** Konum metni (içerir; ASCII katlama). */
  location?: string;
  remote?: boolean;
  withinDays?: number;
  page: number;
  pageSize: number;
};

export async function searchJobPostingRows(
  db: Pick<PrismaClient, '$transaction'>,
  query: JobSearchQuery,
): Promise<{ rows: JobPostingRow[]; total: number }> {
  if (query.universityIds.length === 0) return { rows: [], total: 0 };
  const tokens = tokensOf(query.q);
  const hasText = tokens.length > 0;
  // Metin verildi ama harf/rakam içermiyor: hiçbir şeyle eşleşmez (süzgeç sessizce düşmez).
  const emptyText = query.q !== undefined && query.q.trim() !== '' && !hasText;
  const conditions = visible(query.universityIds, query.today, query.now);
  if (emptyText) conditions.push(Prisma.sql`FALSE`);
  if (query.departmentId)
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "JobPostingDepartment" t WHERE t."postingId" = i."id" AND t."departmentId" = ${query.departmentId})`,
    );
  if (query.kind) conditions.push(Prisma.sql`i."kind" = ${query.kind}::"JobPostingKind"`);
  if (query.companyId) conditions.push(Prisma.sql`i."companyId" = ${query.companyId}`);
  if (query.organizationName)
    conditions.push(
      Prisma.sql`i."companyId" IS NULL AND tr_ascii(i."organizationName") = tr_ascii(${query.organizationName})`,
    );
  if (query.location)
    conditions.push(
      Prisma.sql`strpos(tr_ascii(coalesce(i."location", '')), tr_ascii(${query.location})) > 0`,
    );
  if (query.remote !== undefined) conditions.push(Prisma.sql`i."isRemote" = ${query.remote}`);
  if (query.withinDays !== undefined)
    conditions.push(
      Prisma.sql`i."deadlineOn" <= (${query.today}::date + ${query.withinDays}::int)`,
    );
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
    const rows = await tx.$queryRaw<(JobPostingRow & { total: bigint })[]>(Prisma.sql`
      SELECT ${CARD_COLUMNS}, count(*) OVER() AS "total"
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

/** Bir ilanı okuyucu görünürlüğüyle getirir (kapsam dışı, yayında olmayan ya da süresi dolmuş → `null`; varlık sızmaz). */
export async function findJobPostingRow(
  db: Pick<PrismaClient, '$queryRaw'>,
  input: { universityIds: readonly string[]; today: string; now: Date; id: string },
): Promise<JobPostingDetailRow | null> {
  if (input.universityIds.length === 0) return null;
  const where = Prisma.join(
    [...visible(input.universityIds, input.today, input.now), Prisma.sql`i."id" = ${input.id}`],
    ' AND ',
  );
  const rows = await db.$queryRaw<JobPostingDetailRow[]>(Prisma.sql`
    SELECT ${CARD_COLUMNS}, i."description", i."applyUrl", i."authorId" ${FROM} WHERE ${where}`);
  return rows[0] ?? null;
}

export type JobFilterOptionRows = {
  organizations: { key: string; companyId: string | null; name: string; count: number }[];
  departments: { id: string; name: string; count: number }[];
  locations: { name: string; count: number }[];
  remoteCount: number;
};

/**
 * Süzgeç seçenekleri: arayanın üniversitesindeki yayında ve süresi dolmamış ilanlardan türetilir (K-07). Kurumlar ve konumlar
 * ASCII katlamayla gruplanır ("İstanbul"/"istanbul" tek satır; gösterilen yazım en sık/ilk görülendir); en çok `limit` satır, en çok
 * ilanlı başta.
 */
export async function jobPostingFilterOptionRows(
  db: Pick<PrismaClient, '$queryRaw'>,
  input: { universityIds: readonly string[]; today: string; now: Date; limit: number },
): Promise<JobFilterOptionRows> {
  if (input.universityIds.length === 0)
    return { organizations: [], departments: [], locations: [], remoteCount: 0 };
  const where = Prisma.join(visible(input.universityIds, input.today, input.now), ' AND ');
  const [organizations, departments, locations, remote] = await Promise.all([
    // Satır = sözlük şirketi (companyId) YA DA sözlüğe bağlı olmayan, ASCII katlanmış ada göre gruplu serbest kurum.
    db.$queryRaw<{ companyId: string | null; name: string; count: bigint }[]>(Prisma.sql`
      SELECT i."companyId" AS "companyId", min(i."organizationName") AS "name", count(*) AS "count"
      ${FROM} WHERE ${where}
      GROUP BY COALESCE(i."companyId", 'n:' || tr_ascii(i."organizationName")), i."companyId"
      ORDER BY count(*) DESC, min(i."organizationName") ASC
      LIMIT ${input.limit}`),
    db.$queryRaw<{ id: string; name: string; count: bigint }[]>(Prisma.sql`
      SELECT td."id", td."name", count(*) AS "count"
      ${FROM}
      JOIN "JobPostingDepartment" t ON t."postingId" = i."id"
      JOIN "Department" td ON td."id" = t."departmentId"
      WHERE ${where}
      GROUP BY td."id", td."name"
      ORDER BY count(*) DESC, td."name" ASC
      LIMIT ${input.limit}`),
    db.$queryRaw<{ name: string; count: bigint }[]>(Prisma.sql`
      SELECT min(i."location") AS "name", count(*) AS "count"
      ${FROM} WHERE ${where} AND i."location" IS NOT NULL
      GROUP BY tr_ascii(i."location")
      ORDER BY count(*) DESC, min(i."location") ASC
      LIMIT ${input.limit}`),
    db.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT count(*) AS "count" ${FROM} WHERE ${where} AND i."isRemote"`,
    ),
  ]);
  return {
    organizations: organizations.map((row) => ({
      ...row,
      key: row.companyId ?? row.name,
      count: Number(row.count),
    })),
    departments: departments.map((row) => ({ ...row, count: Number(row.count) })),
    locations: locations.map((row) => ({ ...row, count: Number(row.count) })),
    remoteCount: Number(remote[0]?.count ?? 0),
  };
}

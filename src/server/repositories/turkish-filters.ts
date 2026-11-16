import 'server-only';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { escapeLike } from '@/lib/sql-like';
import { normalizeName } from '../rules/dictionary';

type Reader = Pick<PrismaClient, '$queryRaw'>;
/** İki taraf aynı DB işleviyle katlanır; jokerler katlamadan önce düz metin yapılır. */
const contains = (column: Prisma.Sql, query: string) =>
  Prisma.sql`tr_ascii(${column}) LIKE tr_ascii(${`%${escapeLike(query)}%`})`;
const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id);

const dictionaryIds = (kind: 'COMPANY' | 'TITLE', query: string) => {
  const table = kind === 'COMPANY' ? Prisma.sql`"Company"` : Prisma.sql`"Title"`;
  // LIKE işaretleri düz metin kalır; yalnız noktalama içeren sorgu da %% olamaz.
  const normalized = /[%_\\]/u.test(query) ? '' : normalizeName(query, kind);
  return Prisma.sql`SELECT d."id" FROM ${table} d
    WHERE ${contains(Prisma.sql`d."name"`, query)}
      ${normalized ? Prisma.sql`OR d."normalizedName" LIKE ${`%${escapeLike(normalized)}%`}` : Prisma.empty}`;
};

/** Ayrı UNION dalları ham ad ve sözlük trigramlarını bağımsız kullanabilir. */
const matchingPositions = (kind: 'COMPANY' | 'TITLE', query: string) => {
  const raw = kind === 'COMPANY' ? Prisma.sql`p."companyRaw"` : Prisma.sql`p."titleRaw"`;
  const foreignKey = kind === 'COMPANY' ? Prisma.sql`p."companyId"` : Prisma.sql`p."titleId"`;
  return Prisma.sql`SELECT p."id", p."userId" FROM "Position" p
    JOIN scoped_users s ON s."id"=p."userId"
    WHERE p."isCurrent" AND ${contains(raw, query)}
    UNION
    SELECT p."id", p."userId" FROM "Position" p
    JOIN scoped_users s ON s."id"=p."userId"
    WHERE p."isCurrent" AND ${foreignKey} IN (${dictionaryIds(kind, query)})`;
};

/** K-07 kapsamı kimlikler uygulamaya taşınmadan uygulanır. Diğer görünürlük ve sayfalama servisindir. */
export async function matchingDirectoryText(
  db: Reader,
  filter: { q?: string; company?: string; title?: string; city?: string },
  universityIds: string[],
) {
  const scope = Prisma.sql`WITH scoped_users AS MATERIALIZED (
    SELECT DISTINCT m."userId" AS "id" FROM "Membership" m
    JOIN "Department" d ON d."id"=m."departmentId"
    JOIN "Faculty" f ON f."id"=d."facultyId"
    WHERE m."endedAt" IS NULL AND m."verificationStatus"='VERIFIED'
      AND f."universityId"=ANY(${universityIds}::text[])
  )`;
  const result: { users?: string[]; positions?: string[]; profiles?: string[] } = {};
  if (filter.q) {
    const q = filter.q;
    result.users = idsOf(
      await db.$queryRaw<{ id: string }[]>(Prisma.sql`${scope}
      SELECT u."id" FROM "User" u JOIN scoped_users s ON s."id"=u."id"
      WHERE ${contains(Prisma.sql`u."name"`, q)}
      UNION
      SELECT matches."userId" AS "id" FROM (${matchingPositions('COMPANY', q)}) matches
      UNION
      SELECT matches."userId" AS "id" FROM (${matchingPositions('TITLE', q)}) matches`),
    );
  }
  const conditions: Prisma.Sql[] = [];
  if (filter.company)
    conditions.push(Prisma.sql`(${matchingPositions('COMPANY', filter.company)})`);
  if (filter.title) conditions.push(Prisma.sql`(${matchingPositions('TITLE', filter.title)})`);
  if (conditions.length)
    result.positions = idsOf(
      await db.$queryRaw<{ id: string }[]>(Prisma.sql`${scope}
      SELECT matches."id" FROM (${Prisma.join(conditions, ' INTERSECT ')}) matches`),
    );
  if (filter.city)
    result.profiles = idsOf(
      await db.$queryRaw<{ id: string }[]>(Prisma.sql`${scope}
      SELECT p."id" FROM "Profile" p JOIN scoped_users s ON s."id"=p."userId"
      WHERE ${contains(Prisma.sql`p."city"`, filter.city)}`),
    );
  return result;
}

export async function matchingUserNames(db: Reader, query: string) {
  return idsOf(
    await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT u."id" FROM "User" u WHERE ${contains(Prisma.sql`u."name"`, query)}`),
  );
}

export async function matchingCourseNames(db: Reader, departments: string[], query: string) {
  return idsOf(
    await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT c."id" FROM "Course" c WHERE c."departmentId"=ANY(${departments}::text[])
      AND ${contains(Prisma.sql`c."name"`, query)}`),
  );
}

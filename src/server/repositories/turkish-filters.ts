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

/** Ham alan ve sözlük alt sorgusu farklı dallarda aynı pozisyona uygulanır. */
const positionConditions = (kind: 'COMPANY' | 'TITLE', query: string): [Prisma.Sql, Prisma.Sql] => {
  const raw = kind === 'COMPANY' ? Prisma.sql`p."companyRaw"` : Prisma.sql`p."titleRaw"`;
  const foreignKey = kind === 'COMPANY' ? Prisma.sql`p."companyId"` : Prisma.sql`p."titleId"`;
  return [contains(raw, query), Prisma.sql`${foreignKey} IN (${dictionaryIds(kind, query)})`];
};
const positionSelect = (conditions: Prisma.Sql[], column = Prisma.sql`p."id"`) => Prisma.sql`
  SELECT ${column} AS "id" FROM "Position" p JOIN scoped_users s ON s."id"=p."userId"
  WHERE p."isCurrent" AND ${Prisma.join(conditions, ' AND ')}`;

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
    const [rawCompany, company] = positionConditions('COMPANY', filter.q);
    const [rawTitle, title] = positionConditions('TITLE', filter.q);
    result.users = idsOf(
      await db.$queryRaw<{ id: string }[]>(Prisma.sql`${scope}
      SELECT u."id" FROM "User" u JOIN scoped_users s ON s."id"=u."id"
      WHERE ${contains(Prisma.sql`u."name"`, filter.q)}
      UNION ${positionSelect([Prisma.sql`(${rawCompany} OR ${rawTitle})`], Prisma.sql`p."userId"`)}
      UNION ${positionSelect([company], Prisma.sql`p."userId"`)}
      UNION ${positionSelect([title], Prisma.sql`p."userId"`)}`),
    );
  }
  const groups: Prisma.Sql[][] = [];
  if (filter.company) groups.push(positionConditions('COMPANY', filter.company));
  if (filter.title) groups.push(positionConditions('TITLE', filter.title));
  if (groups.length) {
    // En çok iki alan / dört dal. Ayrı kimlik kümelerini sıralayıp kesiştirmek yerine
    // her dalda şirket VE unvan aynı satıra uygulanır; ham dal kendi GIN'ini kullanabilir.
    const branches = groups.reduce<Prisma.Sql[][]>(
      (current, alternatives) =>
        current.flatMap((conditions) =>
          alternatives.map((condition) => [...conditions, condition]),
        ),
      [[]],
    );
    result.positions = idsOf(
      await db.$queryRaw<{ id: string }[]>(Prisma.sql`${scope}
      ${Prisma.join(
        branches.map((conditions) => positionSelect(conditions)),
        ' UNION ',
      )}`),
    );
  }
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

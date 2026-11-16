import 'server-only';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { escapeLike } from '@/lib/sql-like';

type Reader = Pick<PrismaClient, '$queryRaw'>;
/** İki taraf aynı DB işleviyle katlanır; jokerler katlamadan önce düz metin yapılır. */
const contains = (column: Prisma.Sql, query: string) =>
  Prisma.sql`tr_ascii(${column}) LIKE tr_ascii(${`%${escapeLike(query)}%`})`;
const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id);

/** Yalnız eşleşme kimlikleri. Yetki/görünürlük, sıralama ve sayfalama çağıranın Prisma sorgusunda kalır. */
export async function matchingDirectoryText(
  db: Reader,
  filter: { q?: string; company?: string; title?: string; city?: string },
) {
  const result: { users?: string[]; positions?: string[]; profiles?: string[] } = {};
  if (filter.q) {
    const q = filter.q;
    result.users = idsOf(
      await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT u."id" FROM "User" u WHERE ${contains(Prisma.sql`u."name"`, q)}
      UNION
      SELECT p."userId" AS "id" FROM "Position" p
      LEFT JOIN "Company" c ON c."id"=p."companyId"
      LEFT JOIN "Title" t ON t."id"=p."titleId"
      WHERE p."isCurrent" AND (
        ${contains(Prisma.sql`p."companyRaw"`, q)} OR ${contains(Prisma.sql`p."titleRaw"`, q)}
        OR ${contains(Prisma.sql`c."name"`, q)} OR ${contains(Prisma.sql`t."name"`, q)})`),
    );
  }
  const conditions: Prisma.Sql[] = [];
  if (filter.company)
    conditions.push(Prisma.sql`(${contains(Prisma.sql`p."companyRaw"`, filter.company)}
      OR ${contains(Prisma.sql`c."name"`, filter.company)})`);
  if (filter.title)
    conditions.push(Prisma.sql`(${contains(Prisma.sql`p."titleRaw"`, filter.title)}
      OR ${contains(Prisma.sql`t."name"`, filter.title)})`);
  if (conditions.length)
    result.positions = idsOf(
      await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p."id" FROM "Position" p
      LEFT JOIN "Company" c ON c."id"=p."companyId"
      LEFT JOIN "Title" t ON t."id"=p."titleId"
      WHERE p."isCurrent" AND ${Prisma.join(conditions, ' AND ')}`),
    );
  if (filter.city)
    result.profiles = idsOf(
      await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p."id" FROM "Profile" p WHERE ${contains(Prisma.sql`p."city"`, filter.city)}`),
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

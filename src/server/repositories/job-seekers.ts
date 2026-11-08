import 'server-only';

import { Prisma, type PrismaClient } from '@/generated/prisma/client';

/**
 * Aday arama deposu (P2-06) — HAM SQL YALNIZ BURADADIR. Güvenlik ilkeleri:
 *  - Görünürlük BU SORGUDA, sorgu anında hesaplanır: bayrak AND opak kimlik AND `JOB_SEEKER_VISIBILITY` için kullanıcının SON rıza satırı
 *    `granted` ve güncel sürüm AND hesap silinmemiş/askıda değil AND doğrulanmış etkin ÖĞRENCİ üyeliği AND arayanın üniversitesi (K-07).
 *    Rıza geri alındığı an satır sonuç kümesinden düşer; temizlik (`revokeSeekerVisibility`) buna ek bir katmandır.
 *  - Arayanın kendisi ve arayanla aynı SEEKER_PROFILE kaynağından AÇIK iletişim talebi olan kişi sonuçta YOKTUR (kimlik eşleştirme yan kanalını kapatır).
 *  - Çıktı yalnız kart alanlarıdır; sahibin adı/e-postası yalnız başlık satırının kimlik denetimi için okunur ve servis katmanında bırakılır.
 *    Kart etiketleri yalnız `curated` olanlardır (serbest yazılmış beceri kişisel veri taşıyabilir).
 *  - Sıralama opak kimliğe göredir: rastgele ama sayfalar arasında kararlı; kayıt/zaman sırası sızmaz. Kullanıcı girdisi yalnız bağlı parametredir.
 */

export type SeekerRow = {
  userId: string;
  ref: string;
  headline: string | null;
  departmentId: string;
  departmentName: string;
  entryYear: number | null;
  classOffset: number;
  termYear: number | null;
  termSeason: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' | null;
  tags: { kind: 'INTEREST' | 'SKILL' | 'GOAL'; slug: string }[];
  /** YALNIZ başlık satırının kimlik denetimi için; karta/çıktıya girmez. */
  guardName: string;
  guardEmail: string;
};

export type SeekerQuery = {
  /** Arayan (kendisi ve açık talebi olduğu kişiler hariç tutulur). */
  viewerId: string;
  universityIds: readonly string[];
  now: Date;
  /** Güncel `JOB_SEEKER_VISIBILITY` sürümü. */
  consentVersion: string;
  departmentId?: string | undefined;
  tagSlugs?: readonly string[] | undefined;
  termYear?: number | undefined;
  termSeason?: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' | undefined;
  /**
   * Arayanla aynı SEEKER_PROFILE kaynağından açık talebi olan kişileri DIŞLAMA (yalnız talep gönderildikten sonraki yeniden doğrulama içindir: yeni bekleyen talep
   * kişiyi zaten dışlar). Arama ve ilk çözümleme bunu KULLANMAZ.
   */
  keepOpenRequests?: boolean | undefined;
};

type Client = Pick<PrismaClient, '$queryRaw'>;

const CONSENT_OK = (version: string) => Prisma.sql`(
  SELECT c."granted" AND c."version" = ${version}
  FROM "Consent" c
  WHERE c."userId" = p."userId" AND c."documentType" = 'JOB_SEEKER_VISIBILITY'
  ORDER BY c."createdAt" DESC, c."id" DESC
  LIMIT 1
) IS TRUE`;

function conditions(q: SeekerQuery, extra: Prisma.Sql[] = []): Prisma.Sql {
  const where: Prisma.Sql[] = [
    Prisma.sql`p."seekingInternship" = true`,
    Prisma.sql`p."seekerRef" IS NOT NULL`,
    Prisma.sql`p."userId" <> ${q.viewerId}`,
    Prisma.sql`u."deletedAt" IS NULL`,
    Prisma.sql`(u."banned" = false OR (u."banExpires" IS NOT NULL AND u."banExpires" <= ${q.now}))`,
    CONSENT_OK(q.consentVersion),
    ...extra,
  ];
  if (!q.keepOpenRequests)
    where.push(Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "ContactRequest" r
      WHERE r."requesterId" = ${q.viewerId} AND r."targetId" = p."userId" AND r."source" = 'SEEKER_PROFILE' AND r."status" IN ('PENDING', 'APPROVED')
    )`);
  if (q.termYear !== undefined) where.push(Prisma.sql`p."seekingTermYear" = ${q.termYear}`);
  if (q.termSeason !== undefined)
    where.push(Prisma.sql`p."seekingTermSeason" = ${q.termSeason}::"TermSeason"`);
  const slugs = [...new Set(q.tagSlugs ?? [])];
  if (slugs.length > 0)
    where.push(Prisma.sql`(
      SELECT count(DISTINCT t."slug") FROM "ProfileTag" pt JOIN "Tag" t ON t."id" = pt."tagId"
      WHERE pt."profileId" = p."id" AND t."curated" = true AND t."slug" = ANY(${slugs}::text[])
    ) = ${slugs.length}`);
  return Prisma.join(where, ' AND ');
}

/** Kapsamdaki doğrulanmış etkin öğrenci üyeliği (arayanın üniversitesinde; istenirse belirli bölüm). */
function membershipJoin(q: SeekerQuery): Prisma.Sql {
  const department = q.departmentId
    ? Prisma.sql`AND m."departmentId" = ${q.departmentId}`
    : Prisma.empty;
  return Prisma.sql`JOIN LATERAL (
    SELECT m."departmentId", m."entryYear", m."classOffset", d."name" AS "departmentName"
    FROM "Membership" m
    JOIN "Department" d ON d."id" = m."departmentId"
    JOIN "Faculty" f ON f."id" = d."facultyId"
    WHERE m."userId" = p."userId" AND m."role" = 'STUDENT' AND m."verificationStatus" = 'VERIFIED' AND m."endedAt" IS NULL
      AND f."universityId" = ANY(${[...q.universityIds]}::text[]) ${department}
    ORDER BY m."createdAt" DESC, m."id" DESC
    LIMIT 1
  ) ms ON true`;
}

const COLUMNS = Prisma.sql`p."userId", p."seekerRef" AS "ref", p."headline", ms."departmentId", ms."departmentName", ms."entryYear",
  ms."classOffset", p."seekingTermYear" AS "termYear", p."seekingTermSeason" AS "termSeason", u."name" AS "guardName", u."email" AS "guardEmail",
  COALESCE((SELECT json_agg(json_build_object('kind', t."kind", 'slug', t."slug") ORDER BY t."kind", t."slug")
    FROM "ProfileTag" pt JOIN "Tag" t ON t."id" = pt."tagId"
    WHERE pt."profileId" = p."id" AND t."curated" = true), '[]'::json) AS "tags"`;

const FROM = Prisma.sql`FROM "Profile" p JOIN "User" u ON u."id" = p."userId"`;

export async function searchSeekerRows(
  db: Client,
  q: SeekerQuery,
  page: { limit: number; offset: number },
): Promise<{ rows: SeekerRow[]; total: number }> {
  if (q.universityIds.length === 0) return { rows: [], total: 0 };
  const join = membershipJoin(q);
  const where = conditions(q);
  const totalRows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS "total" ${FROM} ${join} WHERE ${where}`;
  const total = Number(totalRows[0]?.total ?? 0);
  if (page.limit <= 0 || total === 0) return { rows: [], total };
  const rows = await db.$queryRaw<SeekerRow[]>`
    SELECT ${COLUMNS} ${FROM} ${join} WHERE ${where}
    ORDER BY p."seekerRef" ASC LIMIT ${page.limit} OFFSET ${page.offset}`;
  return { rows, total };
}

/** Opak kimlikten TEK aday; görünürlük koşulları aramayla aynıdır (kapsam dışı/kapalı/rızasız ⇒ `null`). */
export async function findSeekerByRef(
  db: Client,
  q: SeekerQuery,
  ref: string,
): Promise<SeekerRow | null> {
  if (q.universityIds.length === 0) return null;
  const rows = await db.$queryRaw<SeekerRow[]>`
    SELECT ${COLUMNS} ${FROM} ${membershipJoin(q)}
    WHERE ${conditions(q, [Prisma.sql`p."seekerRef" = ${ref}`])} LIMIT 1`;
  return rows[0] ?? null;
}

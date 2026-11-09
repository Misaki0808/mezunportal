import 'server-only';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import {
  COMPANY_MIN_GROUP,
  companyDetailSchema,
  companiesPageSchema,
  type CompaniesPage,
  type CompanyDetail,
} from '@/contracts/companies';
import { createPermissions } from '../permissions/guards';
import { codedNotFound } from '@/lib/errors';
import { asciiFold } from '../repositories/search';
import { visibleJobPostingIds } from '../repositories/job-postings';
import { requireConsent } from './privacy';
import { viewerUniversityIds } from './search';
import { loadCompanyMentorCards, notSuspended } from './mentor-directory';
import type { Actor } from '../permissions/actor';

type Tx = Prisma.TransactionClient;
export type CompanyDeps = { db: PrismaClient; now?: () => Date };
export function companySlug(name: string, id: string): string {
  const prefix =
    asciiFold(name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70) || 'sirket';
  return `${prefix}-${id}`;
}
function idFromSlug(slug: string): string | null {
  return (
    slug.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
    )?.[1] ?? null
  );
}
const summary = (row: { id: string; name: string; sector: { name: string } | null }) => ({
  id: row.id,
  slug: companySlug(row.name, row.id),
  name: row.name,
  sector: row.sector?.name ?? null,
});
async function asMember<T>(
  deps: CompanyDeps,
  userId: string,
  run: (tx: Tx, actor: Actor, universities: string[], now: Date) => Promise<T>,
): Promise<T> {
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(
    async (tx) => {
      const actor = await createPermissions({
        db: () => tx,
        getSessionUserId: async () => userId,
        now: () => now,
      }).requireVerifiedMember();
      await requireConsent(tx, userId);
      return run(tx, actor, await viewerUniversityIds(tx, actor), now);
    },
    { isolationLevel: 'RepeatableRead', timeout: 20000, maxWait: 10000 },
  );
}
/** Pozisyonlar bugün profilde aynı üniversitenin doğrulanmış üyelerine açıktır (PM A). */
export function countableAlumniPositionsWhere(
  companyId: string | undefined,
  universityIds: string[],
  now: Date,
): Prisma.PositionWhereInput {
  return {
    ...(companyId ? { companyId } : {}),
    user: {
      deletedAt: null,
      ...notSuspended(now),
      memberships: {
        some: {
          role: 'ALUMNI',
          endedAt: null,
          verificationStatus: 'VERIFIED',
          department: { faculty: { universityId: { in: universityIds } } },
        },
      },
    },
  };
}
export async function searchCompanies(
  deps: CompanyDeps,
  userId: string,
  q: string,
): Promise<CompaniesPage> {
  return asMember(deps, userId, async (tx, _actor, universities) => {
    const needle = asciiFold(q.trim());
    const pattern = `%${needle.replace(/[\\%_]/g, '\\$&')}%`;
    await tx.$queryRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.45', true)`;
    const rows = await tx.$queryRaw<
      { id: string; name: string; sector: string | null }[]
    >(Prisma.sql`
      SELECT c."id", c."name", s."name" AS sector FROM "Company" c LEFT JOIN "Sector" s ON s."id"=c."sectorId"
      WHERE ${needle} = '' OR c."searchKeys" LIKE ${pattern} OR (${needle.length} >= 4 AND ${needle} <% c."searchKeys")
      ORDER BY CASE WHEN ${needle} = '' THEN 0 ELSE word_similarity(${needle}, c."searchKeys") END DESC, c."name" ASC, c."id" ASC LIMIT 40`);
    // Sıralamayı yalnız adla yayımlanmış deneyim belirler: anonim bir deneyimin eklenmesi popüler sırasından kimlik çıkarmaya izin vermez.
    const popular = await tx.$queryRaw<
      { id: string; name: string; sector: string | null }[]
    >(Prisma.sql`
      SELECT c."id", c."name", s."name" AS sector FROM "Company" c
      JOIN "Experience" e ON e."companyId" = c."id" AND e."status" = 'PUBLISHED' AND NOT e."isAnonymous"
      JOIN "Department" d ON d."id" = e."departmentIdAtWrite" JOIN "Faculty" f ON f."id" = d."facultyId"
      LEFT JOIN "Sector" s ON s."id" = c."sectorId"
      WHERE f."universityId" = ANY(${universities}::text[])
      GROUP BY c."id", c."name", s."name" HAVING count(DISTINCT e."authorId") >= ${COMPANY_MIN_GROUP} ORDER BY count(*) DESC, c."name" ASC LIMIT 12`);
    const map = (r: { id: string; name: string; sector: string | null }) => ({
      id: r.id,
      name: r.name,
      sector: r.sector,
      slug: companySlug(r.name, r.id),
    });
    return companiesPageSchema.parse({ companies: rows.map(map), popular: popular.map(map) });
  });
}
export async function getCompany(
  deps: CompanyDeps,
  userId: string,
  slug: string,
): Promise<CompanyDetail> {
  const companyId = idFromSlug(slug);
  if (!companyId) throw codedNotFound('RESOURCE_NOT_FOUND');
  return asMember(deps, userId, async (tx, actor, universities, now) => {
    const redirect = await tx.companyMerge.findUnique({
      where: { sourceId: companyId },
      select: { targetId: true },
    });
    const company = await tx.company.findUnique({
      where: { id: redirect?.targetId ?? companyId },
      select: { id: true, name: true, sector: { select: { name: true } } },
    });
    if (!company) throw codedNotFound('RESOURCE_NOT_FOUND');
    const where: Prisma.ExperienceWhereInput = {
      companyId: company.id,
      status: 'PUBLISHED',
      department: { faculty: { universityId: { in: universities } } },
    };
    const experiences = await tx.experience.findMany({
      where,
      select: { id: true, type: true, whatLearned: true, isAnonymous: true, termSeason: true },
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    });
    // Anonim bir yazarın adı/kimliği bu sorguya dahi girmez.
    const named = await tx.experience.findMany({
      where: {
        ...where,
        isAnonymous: false,
        id: { in: experiences.filter((e) => !e.isAnonymous).map((e) => e.id) },
      },
      select: {
        id: true,
        author: {
          select: { id: true, name: true, deletedAt: true, banned: true, banExpires: true },
        },
      },
    });
    const authors = new Map(named.map((entry) => [entry.id, entry.author]));
    const hasAnonymous =
      (await tx.experience.count({ where: { ...where, isAnonymous: true } })) > 0;
    const viewExperiences = experiences.map((entry) => {
      const base = { id: entry.id, type: entry.type, snippet: entry.whatLearned.slice(0, 220) };
      if (entry.isAnonymous) return { ...base, isAnonymous: true as const };
      const author = authors.get(entry.id);
      return {
        ...base,
        isAnonymous: false as const,
        author:
          author &&
          !author.deletedAt &&
          (!author.banned || (author.banExpires && author.banExpires <= now))
            ? { id: author.id, name: author.name }
            : null,
      };
    });
    // Anonim deneyim varsa kişi/pozisyon/dönem kesişimi kimliği açabilir: bütün türetilmiş kesitler bastırılır.
    let current: number | null = null,
      former: number | null = null;
    let periods: { season: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER'; count: number }[] = [];
    let mentors: Awaited<ReturnType<typeof loadCompanyMentorCards>> = [];
    if (!hasAnonymous) {
      const positions = await tx.position.findMany({
        where: countableAlumniPositionsWhere(company.id, universities, now),
        select: { userId: true, isCurrent: true },
      });
      const currentIds = new Set(positions.filter((p) => p.isCurrent).map((p) => p.userId));
      const formerIds = new Set(
        positions.filter((p) => !p.isCurrent && !currentIds.has(p.userId)).map((p) => p.userId),
      );
      current = currentIds.size >= COMPANY_MIN_GROUP ? currentIds.size : null;
      former = formerIds.size >= COMPANY_MIN_GROUP ? formerIds.size : null;
      // k kişi demektir: aynı kişinin tekrarlanan deneyimi grubu tek başına güvenli yapmaz.
      const grouped = await tx.$queryRaw<
        { season: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER'; count: bigint }[]
      >(Prisma.sql`
        SELECT e."termSeason"::text AS season, count(*) AS count
        FROM "Experience" e JOIN "Department" d ON d."id"=e."departmentIdAtWrite"
        JOIN "Faculty" f ON f."id"=d."facultyId"
        WHERE e."companyId"=${company.id} AND e."status"='PUBLISHED' AND e."termSeason" IS NOT NULL
          AND f."universityId" = ANY(${universities}::text[])
        GROUP BY e."termSeason" HAVING count(DISTINCT e."authorId") >= ${COMPANY_MIN_GROUP}`);
      periods = grouped.map((g) => ({ season: g.season, count: Number(g.count) }));
      const candidates = await tx.mentorProfile.findMany({
        where: {
          isActive: true,
          userId: { not: actor.userId },
          user: {
            deletedAt: null,
            ...notSuspended(now),
            memberships: {
              some: {
                endedAt: null,
                verificationStatus: 'VERIFIED',
                department: { faculty: { universityId: { in: universities } } },
              },
            },
            positions: { some: { companyId: company.id, isCurrent: true } },
          },
        },
        select: { userId: true },
        orderBy: { userId: 'asc' },
      });
      mentors = await loadCompanyMentorCards(
        tx,
        universities,
        candidates.map((c) => c.userId),
        now,
      );
    }
    const postings = await tx.jobPosting.findMany({
      where: {
        companyId: company.id,
        status: 'PUBLISHED',
        targets: { some: { department: { faculty: { universityId: { in: universities } } } } },
      },
      select: { id: true, title: true, kind: true },
      orderBy: { publishedAt: 'desc' },
    });
    const visible = new Set(
      await visibleJobPostingIds(
        tx,
        postings.map((p) => p.id),
        now,
      ),
    );
    return companyDetailSchema.parse({
      ...summary(company),
      experiences: viewExperiences,
      alumni: { current, former },
      periods,
      mentors,
      postings: postings
        .filter((p) => visible.has(p.id))
        .map((p) => ({ ...p, title: p.title ?? '' })),
    });
  });
}

/** Sistem yöneticisinin iki sözlük kaydını geri alınamaz biçimde birleştirmesi; kimlik eşlemesi tekrarı idempotent kılar. */
export async function mergeCompanies(
  deps: CompanyDeps,
  adminId: string,
  sourceId: string,
  targetId: string,
) {
  const { loadSystemAdmin } = await import('./admin-access');
  const { recordAdminAction } = await import('./audit');
  const { codedValidation } = await import('@/lib/errors');
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(
    async (tx) => {
      const admin = await loadSystemAdmin(tx, adminId, now);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('company-merge', 0))::text`;
      const existing = await tx.companyMerge.findUnique({
        where: { sourceId },
        select: { targetId: true },
      });
      const targetRedirect = await tx.companyMerge.findUnique({
        where: { sourceId: targetId },
        select: { targetId: true },
      });
      const resolvedTarget = targetRedirect?.targetId ?? targetId;
      if (existing) {
        if (existing.targetId !== resolvedTarget) throw codedValidation('VALIDATION_INVALID');
        return { targetId: existing.targetId, alreadyMerged: true };
      }
      if (sourceId === resolvedTarget) throw codedValidation('VALIDATION_INVALID');
      for (const id of [sourceId, resolvedTarget].sort())
        await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id"=${id} FOR UPDATE`;
      const source = await tx.company.findUnique({
        where: { id: sourceId },
        select: { id: true, normalizedName: true, aliases: true },
      });
      const target = await tx.company.findUnique({
        where: { id: resolvedTarget },
        select: { id: true, normalizedName: true, aliases: true },
      });
      if (!source || !target) throw codedNotFound('RESOURCE_NOT_FOUND');
      const aliases = [
        ...new Set([...target.aliases, source.normalizedName, ...source.aliases]),
      ].filter((v) => v !== target.normalizedName);
      if (aliases.length > 200) throw codedValidation('VALIDATION_INVALID');
      await tx.experience.updateMany({
        where: { companyId: sourceId },
        data: { companyId: resolvedTarget },
      });
      await tx.position.updateMany({
        where: { companyId: sourceId },
        data: { companyId: resolvedTarget },
      });
      await tx.jobPosting.updateMany({
        where: { companyId: sourceId },
        data: { companyId: resolvedTarget },
      });
      await tx.unmatchedValue.updateMany({
        where: { kind: 'COMPANY', resolvedToId: sourceId },
        data: { resolvedToId: resolvedTarget },
      });
      await tx.companyMerge.updateMany({
        where: { targetId: sourceId },
        data: { targetId: resolvedTarget },
      });
      await tx.companyMerge.create({ data: { sourceId, targetId: resolvedTarget } });
      await tx.company.delete({ where: { id: sourceId } });
      await tx.company.update({ where: { id: resolvedTarget }, data: { aliases } });
      await recordAdminAction(tx, {
        actor: admin,
        action: 'DICTIONARY_CHANGE',
        targetType: 'DICTIONARY_ENTRY',
        targetId: resolvedTarget,
        metadata: { kind: 'COMPANY', change: 'MERGE', sourceId },
      });
      return { targetId: resolvedTarget, alreadyMerged: false };
    },
    { timeout: 20000, maxWait: 10000 },
  );
}

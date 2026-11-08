import 'server-only';

import {
  searchPageSchema,
  searchSectorsSchema,
  searchResultSchema,
  type SearchExperiencesFilter,
  type SearchPage,
  type SearchSectors,
  type SearchResult,
} from '@/contracts/search';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { Actor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import { SEARCH_FILTER_KEYS, resultBucketOf } from '@/contracts/metrics';
import { searchExperienceRows, type SearchRow } from '../repositories/search';
import { isAuthorVisible } from '../rules/authorVisibility';
import { evaluateAccess } from '../rules/authorization';
import { emitEvent, subjectFromActor, usedFilterKeys } from './event';

export type SearchDeps = { db: PrismaClient; now?: () => Date };

/**
 * Arayanın K-07 kapsamı: doğrulanmış ETKİN üyeliklerinin bölümlerinin üniversiteleri. Kapsam sunucuda
 * oturumdaki kullanıcıdan hesaplanır; istemci süzgeci bunu genişletemez.
 */
export async function viewerUniversityIds(
  db: Pick<Prisma.TransactionClient, 'department'>,
  actor: Actor,
): Promise<string[]> {
  const departmentIds = actor.facts.memberships
    .filter(
      (membership) => membership.verificationStatus === 'VERIFIED' && membership.endedAt === null,
    )
    .map((membership) => membership.departmentId);
  if (departmentIds.length === 0) return [];
  const rows = await db.department.findMany({
    where: { id: { in: departmentIds } },
    select: { faculty: { select: { universityId: true } } },
  });
  return [...new Set(rows.map((row) => row.faculty.universityId))];
}

function toResult(row: SearchRow, now: Date): SearchResult {
  const base = {
    id: row.id,
    type: row.type,
    organizationName: row.organizationName,
    departmentName: row.departmentName,
    city: row.city,
    country: row.country,
    termYear: row.termYear,
    termSeason: row.termSeason,
    durationWeeks: row.durationWeeks,
    pay: row.pay,
    applicationChannel: row.applicationChannel,
    snippet: row.snippet.trim(),
    publishedAt: row.publishedAt,
  };
  // Yazar yalnız geçerli adlı deneyimde dolu gelir; aksi halde anonim biçimde (yazar alanı hiç yok).
  return searchResultSchema.parse(
    row.authorId &&
      row.authorName &&
      isAuthorVisible(
        {
          deletedAt: row.authorDeletedAt,
          banned: row.authorBanned === true,
          banExpires: row.authorBanExpires,
        },
        now,
      )
      ? { ...base, isAnonymous: false, author: { id: row.authorId, displayName: row.authorName } }
      : { ...base, isAnonymous: true },
  );
}

/** Yayınlanmış ve K-07 görünürlüğündeki deneyimleri arar (metin + süzgeçler + sayfalama). */
export async function searchExperiences(
  deps: SearchDeps,
  actor: Actor,
  filter: SearchExperiencesFilter,
): Promise<SearchPage> {
  // Derinlemesine savunma: koruma çağıranda da çalışır, burada olgularla yeniden doğrulanır.
  const access = evaluateAccess(actor.facts, { action: 'contentRead' });
  if (!access.allowed) throw errorForDenyReason(access.reason);
  const now = (deps.now ?? (() => new Date()))();
  const sort = filter.sort ?? (filter.q ? 'RELEVANCE' : 'NEWEST');
  const { rows, total } = await searchExperienceRows(deps.db, {
    universityIds: await viewerUniversityIds(deps.db, actor),
    q: filter.q,
    types: filter.types,
    company: filter.company,
    sectorId: filter.sectorId,
    channels: filter.channels,
    termYear: filter.termYear,
    termSeason: filter.termSeason,
    pay: filter.pay,
    sort,
    page: filter.page,
    pageSize: filter.pageSize,
  });
  emitEvent(
    deps.db,
    actor.userId,
    {
      type: 'SEARCH',
      props: {
        filters: usedFilterKeys(filter, SEARCH_FILTER_KEYS),
        results: resultBucketOf(total),
      },
    },
    subjectFromActor(actor),
  );
  return searchPageSchema.parse({
    items: rows.map((row) => toResult(row, now)),
    page: filter.page,
    pageSize: filter.pageSize,
    total,
    hasMore: filter.page * filter.pageSize < total,
    sort,
  });
}

/** Sektör süzgeci seçenekleri (ad sırasıyla). */
export async function listSearchSectors(deps: SearchDeps, actor: Actor): Promise<SearchSectors> {
  const access = evaluateAccess(actor.facts, { action: 'contentRead' });
  if (!access.allowed) throw errorForDenyReason(access.reason);
  const sectors = await deps.db.sector.findMany({
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return searchSectorsSchema.parse({ sectors });
}

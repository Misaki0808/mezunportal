import 'server-only';

import {
  getMentorEntryPointsSchema,
  mentorCardSchema,
  mentorEntryPointsSchema,
  mentorPageSchema,
  similarMentorsSchema,
  SIMILAR_MENTORS_MAX,
  type EntryPointBlockReason,
  type MentorCard,
  type MentorEntryPoints,
  type MentorPage,
  type MentorType,
  type SearchMentorsFilter,
  type SimilarMentors,
} from '@/contracts/mentor-directory';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { MENTOR_FILTER_KEYS, resultBucketOf } from '@/contracts/metrics';
import { codedValidation } from '@/lib/errors';
import { escapeLike } from '@/lib/sql-like';

import type { Actor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import { evaluateAccess } from '../rules/authorization';
import { normalizeName } from '../rules/dictionary';
import { computeMentorAvailability } from '../rules/mentorAvailability';
import { rankSimilar, type PathItem, type PathSignals } from '../rules/similarity';
import { emitEvent, subjectFromActor, usedFilterKeys } from './event';
import { approvedCountsThisMonth, type ApprovedCounts } from './mentor-load';
import { viewerUniversityIds } from './search';

/**
 * Mentor dizini (P1-09). Görünür mentor: etkin `MentorProfile`; silinmemiş ve askıda olmayan hesap; kendi bölümünde
 * doğrulanmış etkin üyeliği olan; arayanla aynı üniversitede (K-07). Arayan kendisini göremez. Kapsam sunucuda
 * oturumdaki kullanıcıdan hesaplanır; süzgeçler yalnız daraltır. Kartta e-posta/telefon yoktur.
 */
export type MentorDirectoryDeps = {
  db: PrismaClient;
  now?: () => Date;
  /** Kapasite doluluğu kaynağı; P1-10 gerçek randevu sayımını bağlar. */
  approvedCounts?: ApprovedCounts;
};
const nowOf = (deps: MentorDirectoryDeps) => (deps.now ?? (() => new Date()))();
const countsOf = (deps: MentorDirectoryDeps): ApprovedCounts =>
  deps.approvedCounts ?? approvedCountsThisMonth;

/** Dizin taramasında en çok bu kadar aday işlenir (pilot ölçeği; sayfalama bellekte kapasiteyle birlikte yapılır). */
const SCAN_MAX = 500;
const SIMILAR_POOL_MAX = 200;
const SKILLS_ON_CARD = 5;
const ROLE_PRIORITY: Record<MentorType, number> = { ACADEMIC: 0, ALUMNI: 1, STUDENT: 2 };

function requireDirectoryAccess(actor: Actor) {
  const access = evaluateAccess(actor.facts, { action: 'directoryUse' });
  if (!access.allowed) throw errorForDenyReason(access.reason);
}

// ---------------------------------------------------------------------------------------------
// Görünürlük ve süzgeç
// ---------------------------------------------------------------------------------------------

/** Süresiz ya da süresi dolmamış askı hesabı dizinden düşürür (`accountStatusOf` ile aynı kural). */
const notSuspended = (now: Date): Prisma.UserWhereInput => ({
  NOT: { banned: true, OR: [{ banExpires: null }, { banExpires: { gt: now } }] },
});

function visibleMentorWhere(
  universityIds: string[],
  viewerId: string,
  filter: Partial<SearchMentorsFilter>,
  now: Date,
): Prisma.MentorProfileWhereInput {
  const company = filter.company ? normalizeName(filter.company, 'COMPANY') : null;
  const title = filter.title ? normalizeName(filter.title, 'TITLE') : null;
  const positionClauses: Prisma.PositionWhereInput[] = [];
  if (filter.sectorId) {
    positionClauses.push({
      OR: [{ sectorId: filter.sectorId }, { company: { sectorId: filter.sectorId } }],
    });
  }
  if (filter.company) {
    positionClauses.push({
      OR: [
        { companyRaw: { contains: escapeLike(filter.company), mode: 'insensitive' } },
        ...(company ? [{ company: { normalizedName: { contains: company } } }] : []),
      ],
    });
  }
  if (filter.title) {
    positionClauses.push({
      OR: [
        { titleRaw: { contains: escapeLike(filter.title), mode: 'insensitive' } },
        ...(title ? [{ title: { normalizedName: { contains: title } } }] : []),
      ],
    });
  }
  return {
    isActive: true,
    userId: { not: viewerId },
    ...(filter.meetingModes ? { meetingModes: { hasSome: filter.meetingModes } } : {}),
    user: {
      deletedAt: null,
      ...notSuspended(now),
      memberships: {
        some: {
          endedAt: null,
          verificationStatus: 'VERIFIED',
          ...(filter.mentorTypes ? { role: { in: filter.mentorTypes } } : {}),
          department: { faculty: { universityId: { in: universityIds } } },
        },
      },
      // Her pozisyon süzgeci AYNI pozisyonda sağlanmak zorunda değildir (mentorun yolu bütünüyle aranır).
      ...(positionClauses.length > 0
        ? { AND: positionClauses.map((clause) => ({ positions: { some: clause } })) }
        : {}),
      // Yalnız ADLI deneyim: anonim deneyim mentoru hiçbir süzgeçte ele vermez.
      ...(filter.experienceTypes
        ? {
            experiences: {
              some: {
                status: 'PUBLISHED',
                isAnonymous: false,
                type: { in: filter.experienceTypes },
              },
            },
          }
        : {}),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------------------------

const cardSelect = (universityIds: string[]) =>
  ({
    userId: true,
    monthlyCapacity: true,
    sessionMinutes: true,
    meetingModes: true,
    pausedUntil: true,
    cvReviewEnabled: true,
    user: {
      select: {
        name: true,
        memberships: {
          where: {
            endedAt: null,
            verificationStatus: 'VERIFIED',
            department: { faculty: { universityId: { in: universityIds } } },
          },
          select: { role: true, graduationYear: true, department: { select: { name: true } } },
        },
        profile: {
          select: {
            headline: true,
            tags: {
              select: { tag: { select: { kind: true, slug: true, label: true } } },
              orderBy: [{ createdAt: 'asc' }, { tagId: 'asc' }],
            },
          },
        },
        positions: {
          select: {
            isCurrent: true,
            startYear: true,
            endYear: true,
            companyRaw: true,
            titleRaw: true,
            sector: { select: { name: true } },
            company: { select: { sector: { select: { name: true } } } },
          },
        },
      },
    },
  }) satisfies Prisma.MentorProfileSelect;
type CardRow = Prisma.MentorProfileGetPayload<{ select: ReturnType<typeof cardSelect> }>;

/** Güncel pozisyon; yoksa en son biten/başlayan. */
function representative<
  T extends { isCurrent: boolean; startYear: number | null; endYear: number | null },
>(positions: readonly T[]): T | null {
  const rank = (position: T) => [
    position.isCurrent ? 1 : 0,
    position.endYear ?? Number.NEGATIVE_INFINITY,
    position.startYear ?? Number.NEGATIVE_INFINITY,
  ];
  let best: T | null = null;
  for (const position of positions) {
    if (best === null) best = position;
    else {
      const a = rank(position);
      const b = rank(best);
      for (let index = 0; index < a.length; index += 1) {
        if (a[index]! !== b[index]!) {
          if (a[index]! > b[index]!) best = position;
          break;
        }
      }
    }
  }
  return best;
}

function toCard(row: CardRow, used: number, now: Date): MentorCard {
  const membership = [...row.user.memberships].sort(
    (a, b) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role],
  )[0]!;
  const position = representative(row.user.positions);
  const availability = computeMentorAvailability({
    pausedUntil: row.pausedUntil,
    monthlyCapacity: row.monthlyCapacity,
    used,
    now,
  });
  const tags = row.user.profile?.tags ?? [];
  return mentorCardSchema.parse({
    userId: row.userId,
    displayName: row.user.name,
    headline: row.user.profile?.headline ?? null,
    mentorType: membership.role,
    departmentName: membership.department.name,
    graduationYear: membership.graduationYear,
    position: position ? { company: position.companyRaw, title: position.titleRaw } : null,
    sectorName: position?.sector?.name ?? position?.company?.sector?.name ?? null,
    topics: tags.filter((entry) => entry.tag.kind === 'INTEREST').map((entry) => entry.tag.slug),
    skills: tags
      .filter((entry) => entry.tag.kind === 'SKILL' && entry.tag.label)
      .slice(0, SKILLS_ON_CARD)
      .map((entry) => entry.tag.label as string),
    availability: {
      available: availability.available,
      reason: availability.reason,
      pausedUntil: availability.pausedUntil,
    },
    capacity: {
      monthly: availability.monthly,
      used: availability.used,
      remaining: availability.remaining,
    },
    sessionMinutes: row.sessionMinutes,
    meetingModes: row.meetingModes,
    cvReviewEnabled: row.cvReviewEnabled,
  });
}

async function loadCards(
  deps: MentorDirectoryDeps,
  universityIds: string[],
  mentorIds: string[],
  now: Date,
  knownUsed?: Map<string, number>,
): Promise<MentorCard[]> {
  if (mentorIds.length === 0) return [];
  const rows = await deps.db.mentorProfile.findMany({
    where: { userId: { in: mentorIds } },
    select: cardSelect(universityIds),
  });
  const used = knownUsed ?? (await countsOf(deps)(deps.db, mentorIds, now));
  const byId = new Map(rows.map((row) => [row.userId, row]));
  // Yarışta görünürlüğü kaybeden (üyeliği kapanan vb.) mentor kartı düşer.
  return mentorIds.flatMap((id) => {
    const row = byId.get(id);
    return row && row.user.memberships.length > 0 ? [toCard(row, used.get(id) ?? 0, now)] : [];
  });
}

// ---------------------------------------------------------------------------------------------
// Dizin
// ---------------------------------------------------------------------------------------------

/** Süzgeçlere uyan görünür mentorları (kapasite dahil) sayfalar. */
export async function searchMentors(
  deps: MentorDirectoryDeps,
  actor: Actor,
  filter: SearchMentorsFilter,
): Promise<MentorPage> {
  requireDirectoryAccess(actor);
  const now = nowOf(deps);
  const universityIds = await viewerUniversityIds(deps.db, actor);
  const candidates = await deps.db.mentorProfile.findMany({
    where: visibleMentorWhere(universityIds, actor.userId, filter, now),
    select: { userId: true, monthlyCapacity: true, pausedUntil: true },
    orderBy: [{ createdAt: 'desc' }, { userId: 'asc' }],
    take: SCAN_MAX,
  });

  let ids = candidates.map((candidate) => candidate.userId);
  let used: Map<string, number> | undefined;
  if (filter.onlyAvailable) {
    // Kapasite doluluğu veritabanı süzgecinde yoktur: tüm adaylar için sayılır, dolu olan düşer.
    used = await countsOf(deps)(deps.db, ids, now);
    const usedCounts = used;
    ids = candidates
      .filter(
        (candidate) =>
          computeMentorAvailability({
            pausedUntil: candidate.pausedUntil,
            monthlyCapacity: candidate.monthlyCapacity,
            used: usedCounts.get(candidate.userId) ?? 0,
            now,
          }).available,
      )
      .map((candidate) => candidate.userId);
  }
  const start = (filter.page - 1) * filter.pageSize;
  const pageIds = ids.slice(start, start + filter.pageSize);
  const items = await loadCards(deps, universityIds, pageIds, now, used);
  emitEvent(
    deps.db,
    actor.userId,
    {
      type: 'MENTOR_SEARCH',
      props: {
        filters: usedFilterKeys(filter, MENTOR_FILTER_KEYS),
        results: resultBucketOf(ids.length),
      },
    },
    subjectFromActor(actor),
  );
  return mentorPageSchema.parse({
    items,
    page: filter.page,
    pageSize: filter.pageSize,
    total: ids.length,
    hasMore: start + filter.pageSize < ids.length,
  });
}

// ---------------------------------------------------------------------------------------------
// Benzer yol izleyenler
// ---------------------------------------------------------------------------------------------

const item = (key: string, label: string = key): PathItem => ({ key, label });

type SignalSource = {
  profile: {
    tags: { tag: { kind: 'INTEREST' | 'SKILL' | 'GOAL'; slug: string; label: string | null } }[];
  } | null;
  positions: {
    sectorId: string | null;
    sector: { name: string } | null;
    company: { sectorId: string | null; sector: { name: string } | null } | null;
  }[];
  memberships: { department: { id: string; name: string } }[];
};

function signalsOf(source: SignalSource): PathSignals {
  const tags = source.profile?.tags ?? [];
  const sectors = new Map<string, string>();
  for (const position of source.positions) {
    const id = position.sectorId ?? position.company?.sectorId ?? null;
    const name = position.sector?.name ?? position.company?.sector?.name ?? null;
    if (id && name) sectors.set(id, name);
  }
  const departments = new Map(source.memberships.map((m) => [m.department.id, m.department.name]));
  return {
    sectors: [...sectors].map(([id, name]) => item(id, name)),
    interests: tags.filter((t) => t.tag.kind === 'INTEREST').map((t) => item(t.tag.slug)),
    skills: tags
      .filter((t) => t.tag.kind === 'SKILL' && t.tag.label)
      .map((t) => item(t.tag.slug, t.tag.label as string)),
    goals: tags.filter((t) => t.tag.kind === 'GOAL').map((t) => item(t.tag.slug)),
    departments: [...departments].map(([id, name]) => item(id, name)),
  };
}

const signalSelect = {
  profile: {
    select: { tags: { select: { tag: { select: { kind: true, slug: true, label: true } } } } },
  },
  positions: {
    select: {
      sectorId: true,
      sector: { select: { name: true } },
      company: { select: { sectorId: true, sector: { select: { name: true } } } },
    },
  },
} satisfies Prisma.UserSelect;

/**
 * En çok `SIMILAR_MENTORS_MAX` MÜSAİT mentor, gerekçe etiketleriyle (`rules/similarity`). Aday havuzu görünür
 * mentorlardır (dizinle aynı görünürlük); arayanın etiket/sektör/bölüm işaretleriyle örtüşenler seçilir.
 */
export async function getSimilarMentors(
  deps: MentorDirectoryDeps,
  actor: Actor,
): Promise<SimilarMentors> {
  requireDirectoryAccess(actor);
  const now = nowOf(deps);
  const universityIds = await viewerUniversityIds(deps.db, actor);

  const viewer = await deps.db.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: {
      ...signalSelect,
      memberships: {
        where: { endedAt: null, verificationStatus: 'VERIFIED' },
        select: { department: { select: { id: true, name: true } } },
      },
    },
  });
  const viewerSignals = signalsOf(viewer);

  const pool = await deps.db.mentorProfile.findMany({
    where: visibleMentorWhere(universityIds, actor.userId, { onlyAvailable: true }, now),
    select: {
      userId: true,
      monthlyCapacity: true,
      pausedUntil: true,
      user: {
        select: {
          ...signalSelect,
          memberships: {
            where: {
              endedAt: null,
              verificationStatus: 'VERIFIED',
              department: { faculty: { universityId: { in: universityIds } } },
            },
            select: { department: { select: { id: true, name: true } } },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { userId: 'asc' }],
    take: SIMILAR_POOL_MAX,
  });
  const used = await countsOf(deps)(
    deps.db,
    pool.map((row) => row.userId),
    now,
  );
  const available = pool.filter(
    (row) =>
      row.user.memberships.length > 0 &&
      computeMentorAvailability({
        pausedUntil: row.pausedUntil,
        monthlyCapacity: row.monthlyCapacity,
        used: used.get(row.userId) ?? 0,
        now,
      }).available,
  );

  const ranked = rankSimilar(
    viewerSignals,
    available.map((row) => ({ id: row.userId, signals: signalsOf(row.user) })),
    SIMILAR_MENTORS_MAX,
  );
  const cards = new Map(
    (
      await loadCards(
        deps,
        universityIds,
        ranked.map((match) => match.id),
        now,
        used,
      )
    ).map((card) => [card.userId, card]),
  );
  return similarMentorsSchema.parse({
    items: ranked.flatMap((match) => {
      const mentor = cards.get(match.id);
      return mentor ? [{ mentor, reasons: match.reasons }] : [];
    }),
  });
}

// ---------------------------------------------------------------------------------------------
// Profilden giriş noktaları
// ---------------------------------------------------------------------------------------------

/**
 * Hedef profil için randevu / CV incelemesi / iletişim talebi uygunluğu. Yalnız bayrak ve sebep döner; talebi
 * oluşturan eylemler kendi kartlarındadır. Görünür mentor değilse (olmayan, askıda, başka üniversite, mentor
 * değil) üç bayrak da `NOT_MENTOR`: varlık ayrımı yapılmaz. İletişim talebi görünür her üyeye açıktır (mentor olması
 * gerekmez).
 */
export async function getMentorEntryPoints(
  deps: MentorDirectoryDeps,
  actor: Actor,
  input: unknown,
): Promise<MentorEntryPoints> {
  requireDirectoryAccess(actor);
  const parsed = getMentorEntryPointsSchema.safeParse(input);
  if (!parsed.success) throw codedValidation('VALIDATION_INVALID');
  const targetId = parsed.data.userId;
  const now = nowOf(deps);
  const blocked = (reason: EntryPointBlockReason) => ({ available: false, reason });
  const open = { available: true, reason: null };

  if (targetId === actor.userId) {
    return mentorEntryPointsSchema.parse({
      appointment: blocked('SELF'),
      cvReview: blocked('SELF'),
      contact: blocked('SELF'),
    });
  }
  const universityIds = await viewerUniversityIds(deps.db, actor);
  const visibleMember = await deps.db.user.count({
    where: {
      id: targetId,
      deletedAt: null,
      ...notSuspended(now),
      memberships: {
        some: {
          endedAt: null,
          verificationStatus: 'VERIFIED',
          department: { faculty: { universityId: { in: universityIds } } },
        },
      },
    },
  });
  if (visibleMember === 0) {
    return mentorEntryPointsSchema.parse({
      appointment: blocked('NOT_MENTOR'),
      cvReview: blocked('NOT_MENTOR'),
      contact: blocked('NOT_MENTOR'),
    });
  }
  const mentor = await deps.db.mentorProfile.findFirst({
    where: { ...visibleMentorWhere(universityIds, actor.userId, {}, now), userId: targetId },
    select: {
      userId: true,
      monthlyCapacity: true,
      pausedUntil: true,
      cvReviewEnabled: true,
      cvReviewMonthlyLimit: true,
    },
  });
  if (!mentor) {
    return mentorEntryPointsSchema.parse({
      appointment: blocked('NOT_MENTOR'),
      cvReview: blocked('NOT_MENTOR'),
      contact: open,
    });
  }
  emitEvent(deps.db, actor.userId, { type: 'MENTOR_VIEWED', props: {} }, subjectFromActor(actor));
  const used = (await countsOf(deps)(deps.db, [targetId], now)).get(targetId) ?? 0;
  const availability = computeMentorAvailability({
    pausedUntil: mentor.pausedUntil,
    monthlyCapacity: mentor.monthlyCapacity,
    used,
    now,
  });
  return mentorEntryPointsSchema.parse({
    appointment: availability.available ? open : blocked(availability.reason!),
    cvReview:
      mentor.cvReviewEnabled && mentor.cvReviewMonthlyLimit > 0
        ? open
        : blocked('CV_REVIEW_DISABLED'),
    contact: open,
  });
}

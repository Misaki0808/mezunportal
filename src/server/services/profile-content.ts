import 'server-only';

import {
  PROFILE_ENTRY_LIMITS,
  PROFILE_SKILL_LIMIT,
  SOCIAL_LINK_KINDS,
  normalizeLinkedinUrl,
  normalizeSocialLink,
  type MyProfile,
  type ProfileEntrySection,
  type ProfileView,
  type SkillSuggestions,
  type SocialLink,
} from '@/contracts/profile-content';
import type { ContactField } from '@/contracts/privacy';
import type {
  ParsedCertification,
  ParsedEducation,
  ParsedLanguage,
  ParsedPosition,
} from '@/contracts/cv';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { codedConflict, codedNotFound, codedValidation } from '@/lib/errors';

import { loadActor, type Actor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import { accountStatusOf, evaluateAccess } from '../rules/authorization';
import { normalizeName } from '../rules/dictionary';
import { effectiveLevel, fieldAccess, type ViewerRelation } from '../rules/visibility';
import { matchDictionaryName, recordUnmatched } from './cv-dictionary';
import { loadProfileCompletion, syncCompletionScore } from './profile';
import { attachSkill, ensureProfile, pruneOrphanSkillTags } from './profile-skills';
import { loadVisibilityLevels } from './privacy';

/**
 * Profil içeriği servisi (P1-06). Kendi profilin: görüntüle/düzenle. Başkasının profili: görünürlük süzgeci
 * SUNUCUDA — gizli alanın anahtarı yanıtta hiç yoktur. Kimlik yalnız `userId` parametresidir (oturumdan);
 * her değişiklik kullanıcı satırı kilidi altında, hesap durumu yeniden okunarak yapılır (hesap silmeyle ortak).
 */

export type ProfileContentDeps = { db: PrismaClient; now?: () => Date };
type Tx = Prisma.TransactionClient;
const nowOf = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();
const TX = { timeout: 20_000, maxWait: 10_000 } as const;

// ---------------------------------------------------------------------------------------------
// Ortak
// ---------------------------------------------------------------------------------------------

/** Oturumdaki hesap etkin mi? (Silinmiş/askıdaki hiçbir şey yazamaz.) */
async function lockCurrentUser(tx: Tx, userId: string, now: Date): Promise<Actor> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const actor = await loadActor(tx, userId, now);
  const decision = evaluateAccess(actor?.facts ?? null, { action: 'selfProfile' });
  if (!decision.allowed || !actor) {
    throw errorForDenyReason(decision.allowed ? 'UNAUTHENTICATED' : decision.reason);
  }
  return actor;
}

const ym = (year: number | null, month: number | null) =>
  year === null
    ? null
    : month === null
      ? String(year)
      : `${year}-${String(month).padStart(2, '0')}`;
function splitYm(value: string | null) {
  const [year, month] = value ? value.split('-').map(Number) : [null, null];
  return { year: year ?? null, month: month ?? null };
}

function parseSocialLinks(value: Prisma.JsonValue | null): SocialLink[] {
  if (!Array.isArray(value)) return [];
  const links: SocialLink[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { kind, url } = entry as { kind?: unknown; url?: unknown };
    if (typeof kind !== 'string' || typeof url !== 'string') continue;
    if (!(SOCIAL_LINK_KINDS as readonly string[]).includes(kind)) continue;
    // Saklı veri de yeniden doğrulanır (savunma derinliği): izinli alan adı dışı hiçbir bağlantı yayılmaz.
    const normalized = normalizeSocialLink(kind as SocialLink['kind'], url);
    if (normalized.ok) links.push({ kind: kind as SocialLink['kind'], url: normalized.url });
  }
  return links;
}

function safeLinkedin(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeLinkedinUrl(value);
  return normalized.ok ? normalized.url : null;
}

const newest = (...dates: (Date | null | undefined)[]): Date | null =>
  dates.reduce<Date | null>(
    (latest, date) => (date && (!latest || date > latest) ? date : latest),
    null,
  );

// ---------------------------------------------------------------------------------------------
// Kendi profilim
// ---------------------------------------------------------------------------------------------

async function buildMyProfile(tx: Tx, userId: string, now: Date): Promise<MyProfile> {
  const [user, profile, education, positions, languages, certifications] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    tx.profile.findUnique({
      where: { userId },
      include: {
        tags: {
          where: { tag: { kind: 'SKILL' } },
          select: { tagId: true, updatedAt: true, tag: { select: { label: true } } },
          orderBy: [{ createdAt: 'asc' }, { tagId: 'asc' }],
        },
      },
    }),
    tx.education.findMany({ where: { userId }, orderBy: [{ startYear: 'desc' }, { id: 'asc' }] }),
    tx.position.findMany({ where: { userId }, orderBy: [{ startYear: 'desc' }, { id: 'asc' }] }),
    tx.language.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    tx.certification.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
  ]);
  const skills = (profile?.tags ?? []).map((row) => ({
    tagId: row.tagId,
    label: row.tag.label ?? '',
  }));
  return {
    userId,
    displayName: user.name,
    headline: profile?.headline ?? null,
    summary: profile?.summary ?? null,
    city: profile?.city ?? null,
    goals: profile?.goals ?? null,
    education: education.map((row) => ({
      id: row.id,
      source: row.source,
      manuallyEdited: row.manuallyEdited,
      institution: row.institution,
      level: row.level,
      fieldOfStudy: row.fieldOfStudy,
      startDate: ym(row.startYear, row.startMonth),
      endDate: ym(row.endYear, row.endMonth),
      isCurrent: row.isCurrent,
    })),
    positions: positions.map((row) => ({
      id: row.id,
      source: row.source,
      manuallyEdited: row.manuallyEdited,
      company: row.companyRaw,
      title: row.titleRaw,
      employmentType: row.employmentType,
      startDate: ym(row.startYear, row.startMonth),
      endDate: ym(row.endYear, row.endMonth),
      isCurrent: row.isCurrent,
      description: row.description,
    })),
    languages: languages.map((row) => ({
      id: row.id,
      source: row.source,
      manuallyEdited: row.manuallyEdited,
      name: row.name,
      level: row.level,
    })),
    certifications: certifications.map((row) => ({
      id: row.id,
      source: row.source,
      manuallyEdited: row.manuallyEdited,
      name: row.name,
      issuer: row.issuer,
      issuedDate: ym(row.issuedYear, row.issuedMonth),
    })),
    skills,
    socialLinks: parseSocialLinks(profile?.socialLinks ?? null),
    linkedinUrl: safeLinkedin(profile?.linkedinUrl ?? null),
    cvUpdatedAt: profile?.cvUpdatedAt ?? null,
    lastUpdatedAt: newest(
      profile?.updatedAt,
      ...education.map((row) => row.updatedAt),
      ...positions.map((row) => row.updatedAt),
      ...languages.map((row) => row.updatedAt),
      ...certifications.map((row) => row.updatedAt),
      ...(profile?.tags ?? []).map((row) => row.updatedAt),
    ),
    completion: await loadProfileCompletion(tx, userId, now),
  };
}

export async function getMyProfile(deps: ProfileContentDeps, userId: string): Promise<MyProfile> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadActor(tx, userId, now);
    const decision = evaluateAccess(actor?.facts ?? null, { action: 'selfProfile' });
    if (!decision.allowed) throw errorForDenyReason(decision.reason);
    return buildMyProfile(tx, userId, now);
  }, TX);
}

/** Her değişiklik: kilit + hesap kontrolü + profil satırı + değişiklik + "son güncelleme" + güncel profil. */
async function mutate(
  deps: ProfileContentDeps,
  userId: string,
  change: (tx: Tx, profileId: string, now: Date) => Promise<void>,
): Promise<MyProfile> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await lockCurrentUser(tx, userId, now);
    const profile = await ensureProfile(tx, userId);
    await change(tx, profile.id, now);
    await tx.profile.update({ where: { id: profile.id }, data: { updatedAt: now } });
    await syncCompletionScore(tx, userId, now);
    return buildMyProfile(tx, userId, now);
  }, TX);
}

export function updateProfileBasics(
  deps: ProfileContentDeps,
  userId: string,
  input: {
    headline?: string | null;
    summary?: string | null;
    city?: string | null;
    goals?: string | null;
  },
) {
  return mutate(deps, userId, async (tx, profileId) => {
    const current = await tx.profile.findUniqueOrThrow({
      where: { id: profileId },
      select: { manualFields: true },
    });
    // Elle yazılan başlık/özet/şehir yeni CV ile sessizce ezilmez; temizlenen alan korumadan çıkar.
    const manual = new Set(current.manualFields);
    for (const field of ['headline', 'summary', 'city'] as const) {
      const value = input[field];
      if (value === undefined) continue;
      if (value === null) manual.delete(field);
      else manual.add(field);
    }
    await tx.profile.update({
      where: { id: profileId },
      data: {
        ...(input.headline !== undefined ? { headline: input.headline } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.goals !== undefined ? { goals: input.goals } : {}),
        manualFields: [...manual],
      },
    });
  });
}

export function setSocialLinks(
  deps: ProfileContentDeps,
  userId: string,
  input: { links: readonly SocialLink[] },
) {
  return mutate(deps, userId, async (tx, profileId) => {
    // Sunucu yeniden doğrular: eylem Zod'dan geçse de servis izinli alan adı dışı bağlantı yazmaz.
    const links = input.links.map((link) => {
      const normalized = normalizeSocialLink(link.kind, link.url);
      if (!normalized.ok) throw codedValidation(normalized.problem);
      return { kind: link.kind, url: normalized.url };
    });
    links.sort((a, b) => a.kind.localeCompare(b.kind));
    await tx.profile.update({
      where: { id: profileId },
      data: { socialLinks: links.length === 0 ? Prisma.DbNull : links },
    });
  });
}

export function setLinkedinUrl(
  deps: ProfileContentDeps,
  userId: string,
  input: { url: string | null },
) {
  return mutate(deps, userId, async (tx, profileId) => {
    let url: string | null = null;
    if (input.url !== null) {
      const normalized = normalizeLinkedinUrl(input.url);
      if (!normalized.ok) throw codedValidation(normalized.problem);
      url = normalized.url;
    }
    await tx.profile.update({ where: { id: profileId }, data: { linkedinUrl: url } });
  });
}

// ---------------------------------------------------------------------------------------------
// Kalemler
// ---------------------------------------------------------------------------------------------

type EntryInput =
  | { section: 'EDUCATION'; id?: string; values: ParsedEducation }
  | { section: 'POSITION'; id?: string; values: ParsedPosition }
  | { section: 'LANGUAGE'; id?: string; values: ParsedLanguage }
  | { section: 'CERTIFICATION'; id?: string; values: ParsedCertification };

const delegates = (tx: Tx) => ({
  EDUCATION: tx.education,
  POSITION: tx.position,
  LANGUAGE: tx.language,
  CERTIFICATION: tx.certification,
});

async function countEntries(tx: Tx, section: ProfileEntrySection, userId: string) {
  switch (section) {
    case 'EDUCATION':
      return tx.education.count({ where: { userId } });
    case 'POSITION':
      return tx.position.count({ where: { userId } });
    case 'LANGUAGE':
      return tx.language.count({ where: { userId } });
    case 'CERTIFICATION':
      return tx.certification.count({ where: { userId } });
  }
}

async function ownsEntry(tx: Tx, section: ProfileEntrySection, userId: string, id: string) {
  const row = await (
    delegates(tx)[section] as unknown as {
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
    }
  ).findFirst({ where: { id, userId }, select: { id: true } });
  return row !== null;
}

export function saveProfileEntry(deps: ProfileContentDeps, userId: string, input: EntryInput) {
  return mutate(deps, userId, async (tx) => {
    if (input.id) {
      if (!(await ownsEntry(tx, input.section, userId, input.id))) {
        throw codedNotFound('RESOURCE_NOT_FOUND');
      }
    } else if (
      (await countEntries(tx, input.section, userId)) >= PROFILE_ENTRY_LIMITS[input.section]
    ) {
      throw codedConflict('PROFILE_LIMIT_REACHED', {
        section: input.section,
        limit: PROFILE_ENTRY_LIMITS[input.section],
      });
    }
    const meta = input.id
      ? { manuallyEdited: true }
      : { userId, source: 'MANUAL' as const, manuallyEdited: true };
    try {
      switch (input.section) {
        case 'EDUCATION': {
          const v = input.values;
          const start = splitYm(v.startDate);
          const end = splitYm(v.endDate);
          const data = {
            institution: v.institution,
            level: v.level,
            fieldOfStudy: v.fieldOfStudy,
            startYear: start.year,
            startMonth: start.month,
            endYear: end.year,
            endMonth: end.month,
            isCurrent: v.isCurrent,
            ...meta,
          };
          if (input.id) await tx.education.update({ where: { id: input.id }, data });
          else await tx.education.create({ data: data as Prisma.EducationUncheckedCreateInput });
          return;
        }
        case 'POSITION': {
          const v = input.values;
          const company = await matchDictionaryName(tx, 'COMPANY', v.company);
          const title = await matchDictionaryName(tx, 'TITLE', v.title);
          const start = splitYm(v.startDate);
          const end = splitYm(v.endDate);
          const data = {
            companyRaw: v.company,
            companyId: company?.id ?? null,
            sectorId: company?.sectorId ?? null,
            titleRaw: v.title,
            titleId: title?.id ?? null,
            employmentType: v.employmentType,
            startYear: start.year,
            startMonth: start.month,
            endYear: end.year,
            endMonth: end.month,
            isCurrent: v.isCurrent,
            description: v.description,
            ...meta,
          };
          if (input.id) await tx.position.update({ where: { id: input.id }, data });
          else await tx.position.create({ data: data as Prisma.PositionUncheckedCreateInput });
          if (!company) await recordUnmatched(tx, 'COMPANY', v.company);
          if (!title) await recordUnmatched(tx, 'TITLE', v.title);
          return;
        }
        case 'LANGUAGE': {
          const v = input.values;
          const data = {
            name: v.name,
            normalizedName: normalizeName(v.name),
            level: v.level,
            ...meta,
          };
          if (input.id) await tx.language.update({ where: { id: input.id }, data });
          else await tx.language.create({ data: data as Prisma.LanguageUncheckedCreateInput });
          return;
        }
        case 'CERTIFICATION': {
          const v = input.values;
          const issued = splitYm(v.issuedDate);
          const data = {
            name: v.name,
            issuer: v.issuer,
            issuedYear: issued.year,
            issuedMonth: issued.month,
            ...meta,
          };
          if (input.id) await tx.certification.update({ where: { id: input.id }, data });
          else
            await tx.certification.create({
              data: data as Prisma.CertificationUncheckedCreateInput,
            });
          return;
        }
      }
    } catch (error) {
      // Aynı dil iki kez eklenemez (kullanıcı + normalleştirilmiş ad benzersiz).
      if ((error as { code?: string }).code === 'P2002') throw codedConflict('RESOURCE_CONFLICT');
      throw error;
    }
  });
}

export function deleteProfileEntry(
  deps: ProfileContentDeps,
  userId: string,
  input: { section: ProfileEntrySection; id: string },
) {
  return mutate(deps, userId, async (tx) => {
    // Hesap sahibine bağlı değilse (başkasının kalemi) bulunamadı: varlık sızmaz.
    const result = await (
      delegates(tx)[input.section] as unknown as {
        deleteMany: (args: unknown) => Promise<{ count: number }>;
      }
    ).deleteMany({ where: { id: input.id, userId } });
    if (result.count === 0) throw codedNotFound('RESOURCE_NOT_FOUND');
  });
}

// ---------------------------------------------------------------------------------------------
// Beceriler
// ---------------------------------------------------------------------------------------------

export function addProfileSkill(deps: ProfileContentDeps, userId: string, input: { name: string }) {
  return mutate(deps, userId, async (tx, profileId) => {
    const match = await matchDictionaryName(tx, 'SKILL', input.name);
    const owned = await tx.profileTag.count({
      where: { profileId, tag: { kind: 'SKILL' } },
    });
    const slug = normalizeName(match?.name ?? input.name);
    const already = await tx.profileTag.count({
      where: { profileId, tag: { kind: 'SKILL', slug } },
    });
    if (already > 0) return; // aynı beceri ikinci kez eklenmez (etkisiz)
    if (owned >= PROFILE_SKILL_LIMIT) {
      throw codedConflict('PROFILE_LIMIT_REACHED', {
        section: 'SKILL',
        limit: PROFILE_SKILL_LIMIT,
      });
    }
    await attachSkill(tx, profileId, { name: input.name, canonicalName: match?.name ?? null });
    if (!match) await recordUnmatched(tx, 'SKILL', input.name);
  });
}

export function removeProfileSkill(
  deps: ProfileContentDeps,
  userId: string,
  input: { tagId: string },
) {
  return mutate(deps, userId, async (tx, profileId) => {
    const removed = await tx.profileTag.deleteMany({
      where: { profileId, tagId: input.tagId, tag: { kind: 'SKILL' } },
    });
    if (removed.count === 0) throw codedNotFound('RESOURCE_NOT_FOUND');
    await pruneOrphanSkillTags(tx);
  });
}

/** Yalnız KURALLI adlar önerilir (sözlük + derlenmiş etiketler); kullanıcıların serbest yazdığı beceri sızmaz. */
export async function suggestSkills(
  deps: ProfileContentDeps,
  userId: string,
  input: { query: string },
): Promise<SkillSuggestions> {
  const now = nowOf(deps);
  const actor = await loadActor(deps.db, userId, now);
  const decision = evaluateAccess(actor?.facts ?? null, { action: 'selfProfile' });
  if (!decision.allowed) throw errorForDenyReason(decision.reason);
  const needle = normalizeName(input.query);
  if (needle === '') return { skills: [] };
  const [dictionary, tags] = await Promise.all([
    deps.db.skill.findMany({
      where: { OR: [{ normalizedName: { contains: needle } }, { aliases: { has: needle } }] },
      select: { name: true },
      take: 20,
    }),
    deps.db.tag.findMany({
      where: { kind: 'SKILL', curated: true, slug: { contains: needle } },
      select: { label: true },
      take: 20,
    }),
  ]);
  const labels = new Map<string, string>();
  for (const label of [
    ...dictionary.map((row) => row.name),
    ...tags.map((row) => row.label ?? ''),
  ]) {
    if (label && !labels.has(normalizeName(label))) labels.set(normalizeName(label), label);
  }
  const skills = [...labels.values()]
    .sort((a, b) => a.localeCompare(b, 'tr'))
    .slice(0, 20)
    .map((label) => ({ label }));
  return { skills };
}

// ---------------------------------------------------------------------------------------------
// Başkasının profili (görünürlük süzgeçli)
// ---------------------------------------------------------------------------------------------

/**
 * Hedefin profilini bakana göre süzer. Hedef yok/silinmiş/askıda, doğrulanmış etkin üyeliği yok ya da bakanla ortak
 * üniversitesi yok → `RESOURCE_NOT_FOUND` (varlık sızmaz). Kendi profilin için sahip ilişkisiyle tam görünüm döner.
 * İletişim ve bağlantı alanları (`EMAIL`, `PHONE`, `SOCIAL_LINKS`, `LINKEDIN`) `rules/visibility` tablosuna göre
 * gelir; gizli alanın ANAHTARI yanıtta yoktur.
 */
export async function getProfile(
  deps: ProfileContentDeps,
  viewerId: string,
  targetUserId: string,
): Promise<ProfileView> {
  const now = nowOf(deps);
  const { db } = deps;
  const viewer = await loadActor(db, viewerId, now);
  const access = evaluateAccess(viewer?.facts ?? null, { action: 'contentRead' });
  if (!access.allowed || !viewer)
    throw errorForDenyReason(access.allowed ? 'UNAUTHENTICATED' : access.reason);
  const notFound = () => codedNotFound('RESOURCE_NOT_FOUND');

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      deletedAt: true,
      banned: true,
      banExpires: true,
      memberships: {
        where: { endedAt: null, verificationStatus: 'VERIFIED' },
        select: {
          role: true,
          department: { select: { name: true, faculty: { select: { universityId: true } } } },
        },
      },
      profile: {
        include: {
          tags: {
            where: { tag: { kind: 'SKILL' } },
            select: { updatedAt: true, tag: { select: { label: true } } },
            orderBy: [{ createdAt: 'asc' }, { tagId: 'asc' }],
          },
        },
      },
      educations: { orderBy: [{ startYear: 'desc' }, { id: 'asc' }] },
      positions: { orderBy: [{ startYear: 'desc' }, { id: 'asc' }] },
      languages: { orderBy: { id: 'asc' } },
      certifications: { orderBy: { id: 'asc' } },
    },
  });
  if (!target || accountStatusOf(target, now) !== 'ACTIVE') throw notFound();
  if (target.memberships.length === 0) throw notFound();

  const isOwner = target.id === viewerId;
  if (!isOwner) {
    const departmentIds = viewer.facts.memberships
      .filter((m) => m.endedAt === null && m.verificationStatus === 'VERIFIED')
      .map((m) => m.departmentId);
    const viewerUniversities = new Set(
      (
        await db.department.findMany({
          where: { id: { in: departmentIds } },
          select: { faculty: { select: { universityId: true } } },
        })
      ).map((row) => row.faculty.universityId),
    );
    const shared = target.memberships.some((m) =>
      viewerUniversities.has(m.department.faculty.universityId),
    );
    if (!shared) throw notFound();
  }

  const levels = (await loadVisibilityLevels(db, [target.id])).get(target.id) ?? new Map();
  const approved = isOwner
    ? new Set<ContactField>()
    : new Set(
        (
          await db.contactRequest.findMany({
            where: { requesterId: viewerId, targetId: target.id, status: 'APPROVED' },
            select: { fields: true },
          })
        ).flatMap((request) => request.fields),
      );
  const allowed = (field: ContactField): boolean => {
    const relation: ViewerRelation = isOwner
      ? 'OWNER'
      : approved.has(field)
        ? 'APPROVED_REQUESTER'
        : 'VERIFIED_MEMBER';
    return fieldAccess({ field, level: effectiveLevel(field, levels), relation }) === 'FULL';
  };

  const profile = target.profile;
  const links = parseSocialLinks(profile?.socialLinks ?? null);
  const linkedin = safeLinkedin(profile?.linkedinUrl ?? null);
  const view = {
    userId: target.id,
    displayName: target.name,
    memberships: target.memberships.map((m) => ({
      departmentName: m.department.name,
      role: m.role,
    })),
    ...(profile?.headline ? { headline: profile.headline } : {}),
    ...(profile?.summary ? { summary: profile.summary } : {}),
    ...(profile?.city ? { city: profile.city } : {}),
    ...(profile?.goals ? { goals: profile.goals } : {}),
    education: target.educations.map((row) => ({
      institution: row.institution,
      level: row.level,
      fieldOfStudy: row.fieldOfStudy,
      startDate: ym(row.startYear, row.startMonth),
      endDate: ym(row.endYear, row.endMonth),
      isCurrent: row.isCurrent,
    })),
    positions: target.positions.map((row) => ({
      company: row.companyRaw,
      title: row.titleRaw,
      employmentType: row.employmentType,
      startDate: ym(row.startYear, row.startMonth),
      endDate: ym(row.endYear, row.endMonth),
      isCurrent: row.isCurrent,
      description: row.description,
    })),
    languages: target.languages.map((row) => ({ name: row.name, level: row.level })),
    certifications: target.certifications.map((row) => ({
      name: row.name,
      issuer: row.issuer,
      issuedDate: ym(row.issuedYear, row.issuedMonth),
    })),
    skills: (profile?.tags ?? []).map((row) => ({ label: row.tag.label ?? '' })),
    ...(allowed('SOCIAL_LINKS') && links.length > 0 ? { socialLinks: links } : {}),
    ...(allowed('LINKEDIN') && linkedin ? { linkedinUrl: linkedin } : {}),
    ...(allowed('EMAIL') && target.email ? { email: target.email } : {}),
    ...(allowed('PHONE') && target.phone ? { phone: target.phone } : {}),
    lastUpdatedAt: newest(
      profile?.updatedAt,
      ...target.educations.map((row) => row.updatedAt),
      ...target.positions.map((row) => row.updatedAt),
      ...target.languages.map((row) => row.updatedAt),
      ...target.certifications.map((row) => row.updatedAt),
      ...(profile?.tags ?? []).map((row) => row.updatedAt),
    ),
  };
  return view as ProfileView;
}

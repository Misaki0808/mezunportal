import 'server-only';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import {
  STORY_CONSENT_VERSION,
  saveStorySchema,
  storyConsentSchema,
  storyIdSchema,
  reviewStorySchema,
  monthlySelectionSchema,
  storiesScopeSchema,
  type MyStory,
  type ModerationStory,
  type PublishedStory,
} from '@/contracts/alumni-story';
import { codedConflict, codedForbidden, codedNotFound, codedValidation } from '@/lib/errors';
import { createPermissions } from '../permissions/guards';
import { analyzeIdentity, foldTr } from '../rules/faq';
import { istanbulMonth } from '../rules/alumniStory';
import { requireConsent } from './privacy';
import { covers, loadAnyAdmin, TX_OPTIONS } from './admin-access';
import { recordAdminAction } from './audit';

type Tx = Prisma.TransactionClient;
type Deps = { db: PrismaClient; now?: () => Date };
const nowOf = (d: Deps) => d.now?.() ?? new Date();
async function member(tx: Tx, userId: string, now: Date, alumniOnly = false) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR SHARE`;
  const actor = await createPermissions({
    db: () => tx,
    getSessionUserId: async () => userId,
    now: () => now,
  }).requireVerifiedMember(alumniOnly ? { roles: ['ALUMNI'] } : {});
  await requireConsent(tx, userId);
  return actor;
}
function departmentIds(actor: Awaited<ReturnType<typeof member>>, alumniOnly = false) {
  return [
    ...new Set(
      actor.facts.memberships
        .filter(
          (m) =>
            m.endedAt === null &&
            m.verificationStatus === 'VERIFIED' &&
            (!alumniOnly || m.role === 'ALUMNI'),
        )
        .map((m) => m.departmentId),
    ),
  ];
}
async function admin(tx: Tx, userId: string, departmentId: string, now: Date) {
  const actor = await loadAnyAdmin(tx, userId, now);
  if (!(await covers(tx, actor, departmentId))) throw codedForbidden('AUTH_FORBIDDEN');
  return actor;
}
const mySelect = {
  id: true,
  departmentId: true,
  body: true,
  status: true,
  publicConsentAt: true,
  publicConsentVersion: true,
  moderationReason: true,
  updatedAt: true,
  department: { select: { name: true } },
} as const;
type Mine = Prisma.AlumniStoryGetPayload<{ select: typeof mySelect }>;
function myView(s: Mine): MyStory {
  return {
    id: s.id,
    departmentId: s.departmentId,
    department: s.department.name,
    body: s.body,
    status: s.status,
    consent: !!s.publicConsentAt && s.publicConsentVersion === STORY_CONSENT_VERSION,
    moderationReason: s.moderationReason,
    updatedAt: s.updatedAt,
  };
}
async function consent(tx: Tx, storyId: string, userId: string, granted: boolean, now: Date) {
  await tx.alumniStory.update({
    where: { id: storyId },
    data: {
      publicConsentAt: granted ? now : null,
      publicConsentVersion: granted ? STORY_CONSENT_VERSION : null,
    },
  });
  await tx.storyConsentDecision.create({
    data: { storyId, userId, granted, version: STORY_CONSENT_VERSION, createdAt: now },
  });
}
/** Kullanıcının kendi hikâyeleri; yalnız etkin doğrulanmış mezun üyelikleri. */
export async function listMyStories(deps: Deps, userId: string): Promise<MyStory[]> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await member(tx, userId, now, true);
    const rows = await tx.alumniStory.findMany({
      where: { userId, departmentId: { in: departmentIds(actor, true) } },
      select: mySelect,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(myView);
  }, TX_OPTIONS);
}
export async function saveStory(deps: Deps, userId: string, input: unknown): Promise<MyStory> {
  const data = saveStorySchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
    const actor = await member(tx, userId, now, true);
    if (!departmentIds(actor, true).includes(data.departmentId))
      throw codedForbidden('AUTH_FORBIDDEN');
    const previous = await tx.alumniStory.findUnique({
      where: { userId_departmentId: { userId, departmentId: data.departmentId } },
    });
    const changed = !previous || previous.body !== data.body;
    const story = await tx.alumniStory.upsert({
      where: { userId_departmentId: { userId, departmentId: data.departmentId } },
      create: { userId, departmentId: data.departmentId, body: data.body },
      update: {
        body: data.body,
        ...(changed
          ? { status: 'DRAFT', submittedAt: null, moderatedAt: null, moderationReason: null }
          : {}),
      },
    });
    const wasGranted =
      !!previous?.publicConsentAt && previous.publicConsentVersion === STORY_CONSENT_VERSION;
    if (!previous || wasGranted !== data.consent)
      await consent(tx, story.id, userId, data.consent, now);
    return myView(
      await tx.alumniStory.findUniqueOrThrow({ where: { id: story.id }, select: mySelect }),
    );
  }, TX_OPTIONS);
}
export async function setStoryConsent(
  deps: Deps,
  userId: string,
  input: unknown,
): Promise<MyStory> {
  const data = storyConsentSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
    const actor = await member(tx, userId, now, true);
    const story = await tx.alumniStory.findFirst({
      where: { id: data.storyId, userId, departmentId: { in: departmentIds(actor, true) } },
    });
    if (!story) throw codedNotFound('RESOURCE_NOT_FOUND');
    await consent(tx, story.id, userId, data.consent, now);
    return myView(
      await tx.alumniStory.findUniqueOrThrow({ where: { id: story.id }, select: mySelect }),
    );
  }, TX_OPTIONS);
}
/** SSS kimlik kuralı: metnin içindeki e-posta/telefon/kimlik ve bilinen başka kişi adları engellenir. */
async function requireIdentitySafe(tx: Tx, authorId: string, body: string) {
  const author = await tx.user.findUniqueOrThrow({
    where: { id: authorId },
    select: { name: true },
  });
  const others = await tx.user.findMany({
    where: { id: { not: authorId }, deletedAt: null },
    select: { name: true },
  });
  const names = [
    ...new Set(others.map((x) => x.name).filter((name) => foldTr(name) !== foldTr(author.name))),
  ];
  // Kendi tam adı yayımlanabilir; ortak bir ad parçasını genel olarak serbest bırakma.
  // İletişim bilgilerini maskelemeden önce denetle, yalnız tam adın geçtiği aralığı çıkar.
  const authorParts = foldTr(author.name).trim().split(/\s+/u);
  const ownFullName = authorParts
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  const nameBody =
    authorParts.length > 1
      ? foldTr(body).replace(
          new RegExp(`(?<![\\p{L}\\p{N}])${ownFullName}(?![\\p{L}\\p{N}])`, 'gu'),
          ' ',
        )
      : body;
  const contacts = analyzeIdentity(body, []);
  const finding = analyzeIdentity(nameBody, names);
  const compact = analyzeIdentity(body.replace(/\s+/gu, ''), [], []);
  if (contacts.blocked || finding.blocked || finding.warnings.length || compact.blocked)
    throw codedValidation('STORY_IDENTITY_LEAK');
}
export async function submitStory(deps: Deps, userId: string, input: unknown): Promise<MyStory> {
  const data = storyIdSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
    const actor = await member(tx, userId, now, true);
    const story = await tx.alumniStory.findFirst({
      where: { id: data.storyId, userId, departmentId: { in: departmentIds(actor, true) } },
    });
    if (!story) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (!story.publicConsentAt || story.publicConsentVersion !== STORY_CONSENT_VERSION)
      throw codedConflict('STORY_INVALID_STATE');
    if (story.status === 'PENDING' || story.status === 'PUBLISHED')
      return myView(
        await tx.alumniStory.findUniqueOrThrow({ where: { id: story.id }, select: mySelect }),
      );
    await requireIdentitySafe(tx, userId, story.body);
    const updated = await tx.alumniStory.update({
      where: { id: story.id },
      data: { status: 'PENDING', submittedAt: now, moderationReason: null },
      select: mySelect,
    });
    return myView(updated);
  }, TX_OPTIONS);
}
export async function listStoryModeration(
  deps: Deps,
  userId: string,
  input: unknown,
): Promise<ModerationStory[]> {
  const data = storiesScopeSchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await admin(tx, userId, data.departmentId, now);
    const rows = await tx.alumniStory.findMany({
      where: {
        departmentId: data.departmentId,
        status: { in: ['PENDING', 'PUBLISHED'] },
        user: {
          deletedAt: null,
          OR: [{ banned: false }, { banExpires: { lte: now } }],
          memberships: {
            some: {
              departmentId: data.departmentId,
              role: 'ALUMNI',
              verificationStatus: 'VERIFIED',
              endedAt: null,
            },
          },
        },
      },
      include: {
        department: { select: { name: true } },
        user: {
          select: {
            name: true,
            suspicionFlags: {
              where: { status: { in: ['OPEN', 'CONFIRMED'] } },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });
    const candidates = await tx.awardCandidate.findMany({
      where: {
        cycle: { departmentId: data.departmentId },
        userId: { in: rows.map((r) => r.userId) },
      },
      select: { userId: true, points: true, cycle: { select: { year: true } } },
      orderBy: { cycle: { year: 'desc' } },
    });
    return rows
      .filter((s) => s.status === 'PENDING' || s.user.suspicionFlags.length === 0)
      .map((s) => ({
        id: s.id,
        userId: s.userId,
        name: s.user.name,
        departmentId: s.departmentId,
        department: s.department.name,
        body: s.body,
        status: s.status,
        consent: !!s.publicConsentAt && s.publicConsentVersion === STORY_CONSENT_VERSION,
        points: candidates.find((x) => x.userId === s.userId)?.points ?? null,
        suspicious: s.user.suspicionFlags.length > 0,
      }))
      .sort((a, b) => (b.points ?? -1) - (a.points ?? -1));
  }, TX_OPTIONS);
}
export async function reviewStory(deps: Deps, userId: string, input: unknown): Promise<MyStory> {
  const data = reviewStorySchema.parse(input),
    now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadAnyAdmin(tx, userId, now);
    await tx.$queryRaw`SELECT "id" FROM "AlumniStory" WHERE "id"=${data.storyId} FOR UPDATE`;
    const story = await tx.alumniStory.findUnique({ where: { id: data.storyId } });
    if (!story || !(await covers(tx, actor, story.departmentId)))
      throw codedNotFound('RESOURCE_NOT_FOUND');
    if (story.status !== 'PENDING') throw codedConflict('STORY_INVALID_STATE');
    if (data.decision === 'PUBLISH') {
      if (!story.publicConsentAt || story.publicConsentVersion !== STORY_CONSENT_VERSION)
        throw codedConflict('STORY_INVALID_STATE');
      await requireIdentitySafe(tx, story.userId, story.body);
    }
    const updated = await tx.alumniStory.update({
      where: { id: story.id },
      data: {
        status: data.decision === 'PUBLISH' ? 'PUBLISHED' : 'REJECTED',
        moderatedAt: now,
        moderationReason: data.decision === 'REJECT' ? data.reason : null,
      },
      select: mySelect,
    });
    await recordAdminAction(tx, {
      actor,
      action: data.decision === 'PUBLISH' ? 'STORY_PUBLISH' : 'STORY_REJECT',
      targetType: 'ALUMNI_STORY',
      targetId: story.id,
      reason: data.reason,
    });
    return myView(updated);
  }, TX_OPTIONS);
}
export async function selectMonthlyAlumnus(deps: Deps, userId: string, input: unknown) {
  const data = monthlySelectionSchema.parse(input),
    now = nowOf(deps),
    current = istanbulMonth(now);
  if (data.month < current) throw codedValidation('VALIDATION_INVALID');
  return deps.db.$transaction(async (tx) => {
    const actor = await admin(tx, userId, data.departmentId, now);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`monthly-alumnus:${data.departmentId}:${data.month}`}, 0))::text`;
    const existing = await tx.monthlyAlumnus.findUnique({
      where: { departmentId_month: { departmentId: data.departmentId, month: data.month } },
    });
    if (existing) throw codedConflict('STORY_MONTH_ALREADY_SELECTED');
    const story = await tx.alumniStory.findFirst({
      where: { id: data.storyId, departmentId: data.departmentId },
      select: { userId: true },
    });
    if (!story) throw codedNotFound('RESOURCE_NOT_FOUND');
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${story.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "AlumniStory" WHERE "id"=${data.storyId} FOR UPDATE`;
    const eligible = await tx.alumniStory.findFirst({
      where: {
        id: data.storyId,
        departmentId: data.departmentId,
        status: 'PUBLISHED',
        publicConsentAt: { not: null },
        publicConsentVersion: STORY_CONSENT_VERSION,
        user: {
          deletedAt: null,
          OR: [{ banned: false }, { banExpires: { lte: now } }],
          suspicionFlags: { none: { status: { in: ['OPEN', 'CONFIRMED'] } } },
          memberships: {
            some: {
              departmentId: data.departmentId,
              role: 'ALUMNI',
              verificationStatus: 'VERIFIED',
              endedAt: null,
            },
          },
        },
      },
      select: { id: true },
    });
    if (!eligible) throw codedConflict('STORY_INVALID_STATE');
    const selection = await tx.monthlyAlumnus.create({
      data: {
        departmentId: data.departmentId,
        storyId: eligible.id,
        month: data.month,
        chosenAt: now,
        active: data.month === current,
      },
    });
    await recordAdminAction(tx, {
      actor,
      action: 'MONTHLY_ALUMNUS_SELECT',
      targetType: 'MONTHLY_ALUMNUS',
      targetId: selection.id,
      reason: data.reason,
    });
    return { selectionId: selection.id };
  }, TX_OPTIONS);
}
function visibleStoryWhere(now: Date): Prisma.AlumniStoryWhereInput {
  return {
    status: 'PUBLISHED',
    publicConsentAt: { not: null },
    publicConsentVersion: STORY_CONSENT_VERSION,
    user: {
      deletedAt: null,
      OR: [{ banned: false }, { banExpires: { lte: now } }],
      suspicionFlags: { none: { status: { in: ['OPEN', 'CONFIRMED'] } } },
    },
  };
}
async function published(
  deps: Deps,
  userId: string,
  options: { id?: string; current?: boolean } = {},
): Promise<PublishedStory[]> {
  const now = nowOf(deps),
    current = istanbulMonth(now);
  return deps.db.$transaction(async (tx) => {
    const actor = await member(tx, userId, now);
    const ids = departmentIds(actor);
    const rows = await tx.monthlyAlumnus.findMany({
      where: {
        departmentId: { in: ids },
        month: options.current ? current : { lte: current },
        ...(options.id ? { storyId: options.id } : {}),
        story: {
          ...visibleStoryWhere(now),
          user: {
            ...(visibleStoryWhere(now).user as Prisma.UserWhereInput),
            memberships: {
              some: {
                role: 'ALUMNI',
                verificationStatus: 'VERIFIED',
                endedAt: null,
                departmentId: { in: ids },
              },
            },
          },
        },
      },
      select: {
        month: true,
        departmentId: true,
        story: {
          select: {
            id: true,
            body: true,
            department: { select: { name: true } },
            user: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ month: 'desc' }, { departmentId: 'asc' }],
    });
    const memberships = await tx.membership.findMany({
      where: {
        role: 'ALUMNI',
        verificationStatus: 'VERIFIED',
        endedAt: null,
        OR: rows.map((row) => ({ userId: row.story.user.id, departmentId: row.departmentId })),
      },
      select: { userId: true, departmentId: true },
    });
    const valid = new Set(
      memberships.map((membership) => `${membership.userId}:${membership.departmentId}`),
    );
    return rows
      .filter((row) => valid.has(`${row.story.user.id}:${row.departmentId}`))
      .map(({ month, story }) => ({
        id: story.id,
        name: story.user.name,
        department: story.department.name,
        body: story.body,
        month,
      }));
  }, TX_OPTIONS);
}
export async function listPublishedStories(deps: Deps, userId: string) {
  return published(deps, userId);
}
export async function getPublishedStory(deps: Deps, userId: string, input: unknown) {
  const data = storyIdSchema.parse(input);
  const rows = await published(deps, userId, { id: data.storyId });
  if (!rows.length) throw codedNotFound('RESOURCE_NOT_FOUND');
  return rows[0]!;
}
export async function getCurrentStory(deps: Deps, userId: string) {
  return (await published(deps, userId, { current: true }))[0] ?? null;
}
/** İstanbul ayı değişince iş idempotent döner; okuyucu iş gecikse de gerçek aya bakar. */
export async function rotateMonthlyAlumni(db: PrismaClient, now = new Date()) {
  const month = istanbulMonth(now);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('monthly-alumni-rotation', 0))::text`;
    await tx.monthlyAlumnus.updateMany({
      where: { active: true, month: { not: month } },
      data: { active: false },
    });
    await tx.monthlyAlumnus.updateMany({ where: { active: false, month }, data: { active: true } });
  }, TX_OPTIONS);
}

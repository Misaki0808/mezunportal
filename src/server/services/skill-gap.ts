import 'server-only';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  selectSkillGoalSchema,
  skillGapResultSchema,
  skillGapTitlesSchema,
  type SelectSkillGoalInput,
} from '@/contracts/skill-gap';
import { codedNotFound } from '@/lib/errors';
import { createPermissions } from '../permissions';
import { normalizeName } from '../rules/dictionary';
import { calculateSkillGap } from '../rules/skillGap';
import { countableAlumniPositionsWhere } from './companies';
import { requireConsent } from './privacy';
import { viewerUniversityIds } from './search';

type Tx = Prisma.TransactionClient;
async function student<T>(
  db: PrismaClient,
  userId: string,
  run: (tx: Tx, universities: string[], now: Date) => Promise<T>,
) {
  const now = new Date();
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
      const actor = await createPermissions({
        db: () => tx,
        getSessionUserId: async () => userId,
        now: () => now,
      }).requireVerifiedMember({ roles: ['STUDENT'] });
      await requireConsent(tx, userId);
      return run(tx, await viewerUniversityIds(tx, actor), now);
    },
    { isolationLevel: 'RepeatableRead', timeout: 20000, maxWait: 10000 },
  );
}
export async function listSkillGapTitles(db: PrismaClient, userId: string) {
  return student(db, userId, async (tx) =>
    skillGapTitlesSchema.parse(
      await tx.title.findMany({
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ),
  );
}
export async function selectSkillGoal(
  db: PrismaClient,
  userId: string,
  input: SelectSkillGoalInput,
) {
  return student(db, userId, async (tx) => {
    const { titleId } = selectSkillGoalSchema.parse(input);
    if (titleId && !(await tx.title.count({ where: { id: titleId } })))
      throw codedNotFound('RESOURCE_NOT_FOUND');
    await tx.profile.upsert({
      where: { userId },
      create: { userId, targetTitleId: titleId },
      update: { targetTitleId: titleId },
    });
    return { saved: true as const };
  });
}
export async function getSkillGap(db: PrismaClient, userId: string) {
  return student(db, userId, async (tx, universities, now) => {
    const profile = await tx.profile.findUnique({
      where: { userId },
      select: {
        targetTitle: { select: { id: true, name: true, normalizedName: true, aliases: true } },
      },
    });
    const title = profile?.targetTitle;
    if (!title) return skillGapResultSchema.parse({ title: null, analysis: null });
    const [dictionary, positions, studentUser, titleDictionary] = await Promise.all([
      tx.skill.findMany({
        select: { id: true, name: true, normalizedName: true, aliases: true },
        orderBy: { name: 'asc' },
      }),
      tx.position.findMany({
        where: { ...countableAlumniPositionsWhere(undefined, universities, now), isCurrent: true },
        select: {
          id: true,
          userId: true,
          titleId: true,
          titleRaw: true,
        },
        orderBy: [
          { userId: 'asc' },
          { startYear: { sort: 'desc', nulls: 'last' } },
          { startMonth: { sort: 'desc', nulls: 'last' } },
          { id: 'asc' },
        ],
      }),
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          profile: {
            select: {
              tags: {
                where: { tag: { kind: 'SKILL' } },
                select: { tag: { select: { slug: true, label: true } } },
              },
            },
          },
        },
      }),
      tx.title.findMany({ select: { id: true, name: true, normalizedName: true, aliases: true } }),
    ]);
    // Aynı takma adın birden fazla sözlük girdisine ait olması eşleştirme için belirsizdir; hiç eşleştirilmez.
    const byName = new Map<string, string | null>();
    for (const skill of dictionary)
      for (const name of [
        skill.name,
        skill.name.slice(0, 80),
        skill.normalizedName,
        ...skill.aliases,
      ]) {
        const key = normalizeName(name, 'SKILL');
        if (!key) continue;
        if (byName.has(key) && byName.get(key) !== skill.id) byName.set(key, null);
        else byName.set(key, skill.id);
      }
    type UserSkills = typeof studentUser;
    const resolve = (user: UserSkills) => {
      const ids = new Set<string>();
      for (const entry of user.profile?.tags ?? []) {
        for (const raw of [entry.tag.label ?? '', entry.tag.slug]) {
          const found = byName.get(normalizeName(raw, 'SKILL'));
          if (found) ids.add(found);
        }
      }
      return [...ids];
    };
    const titleNames = new Map<string, string | null>();
    for (const item of titleDictionary)
      for (const name of [item.name, item.normalizedName, ...item.aliases]) {
        const key = normalizeName(name, 'TITLE');
        if (!key) continue;
        if (titleNames.has(key) && titleNames.get(key) !== item.id) titleNames.set(key, null);
        else titleNames.set(key, item.id);
      }
    const alumniIds = new Set<string>();
    const assigned = new Set<string>();
    for (const position of positions) {
      if (assigned.has(position.userId)) continue;
      assigned.add(position.userId);
      const resolved =
        position.titleId ?? titleNames.get(normalizeName(position.titleRaw, 'TITLE'));
      if (resolved === title.id) alumniIds.add(position.userId);
    }
    const alumni = await tx.user.findMany({
      where: { id: { in: [...alumniIds] } },
      select: {
        profile: {
          select: {
            tags: {
              where: { tag: { kind: 'SKILL' } },
              select: { tag: { select: { slug: true, label: true } } },
            },
          },
        },
      },
    });
    const analysis = calculateSkillGap(
      alumni.map(resolve),
      resolve(studentUser),
      dictionary.map(({ id, name }) => ({ id, label: name })),
    );
    return skillGapResultSchema.parse({ title: { id: title.id, name: title.name }, analysis });
  });
}

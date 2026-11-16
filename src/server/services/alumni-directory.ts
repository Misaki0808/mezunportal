import 'server-only';

import type { AlumniPage, AlumniSearch } from '@/contracts/alumni-directory';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { matchingDirectoryText } from '../repositories/turkish-filters';
import type { Actor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import { evaluateAccess } from '../rules/authorization';
import { normalizeName } from '../rules/dictionary';
import { notSuspended } from './mentor-directory';
import { skillTagIdentity } from './profile-skills';
import { viewerUniversityIds } from './search';

const PAGE_SIZE = 24;
export async function searchAlumni(
  db: PrismaClient,
  actor: Actor,
  filter: AlumniSearch,
  now = new Date(),
): Promise<AlumniPage> {
  const access = evaluateAccess(actor.facts, { action: 'directoryUse' });
  if (!access.allowed) throw errorForDenyReason(access.reason);
  const universityIds = await viewerUniversityIds(db, actor);
  const skillName = filter.skill ? normalizeName(filter.skill, 'SKILL') : '';
  const dictionarySkill = skillName
    ? await db.skill.findFirst({
        where: { OR: [{ normalizedName: skillName }, { aliases: { has: skillName } }] },
        select: { name: true, aliases: true },
      })
    : null;
  const skillNames = skillName
    ? [
        ...new Set(
          [
            skillName,
            ...(dictionarySkill ? [dictionarySkill.name, ...dictionarySkill.aliases] : []),
          ]
            .map((name) => skillTagIdentity(name).slug)
            .filter(Boolean),
        ),
      ]
    : [];
  const membership: Prisma.MembershipWhereInput = {
    role: 'ALUMNI',
    verificationStatus: 'VERIFIED',
    endedAt: null,
    department: { faculty: { universityId: { in: universityIds } } },
    ...(filter.graduationFrom || filter.graduationTo
      ? {
          graduationYear: {
            ...(filter.graduationFrom ? { gte: filter.graduationFrom } : {}),
            ...(filter.graduationTo ? { lte: filter.graduationTo } : {}),
          },
        }
      : {}),
  };
  const text = await matchingDirectoryText(db, filter);
  const positions: Prisma.PositionWhereInput[] = [];
  if (filter.sectorId)
    positions.push({
      OR: [
        { sectorId: filter.sectorId },
        { sectorId: null, company: { sectorId: filter.sectorId } },
      ],
    });
  if (text.positions) positions.push({ id: { in: text.positions } });
  const where: Prisma.UserWhereInput = {
    id: { not: actor.userId, ...(text.users ? { in: text.users } : {}) },
    deletedAt: null,
    ...notSuspended(now),
    memberships: { some: membership },
    profile: {
      alumniDirectoryVisible: true,
      ...(text.profiles ? { id: { in: text.profiles } } : {}),
      ...(filter.skill
        ? { tags: { some: { tag: { kind: 'SKILL', slug: { in: skillNames } } } } }
        : {}),
    },
    ...(positions.length ? { positions: { some: { isCurrent: true, AND: positions } } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (filter.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        memberships: {
          where: membership,
          select: { graduationYear: true },
          orderBy: { graduationYear: 'desc' },
          take: 1,
        },
        positions: {
          ...(positions.length ? { where: { isCurrent: true, AND: positions } } : {}),
          orderBy: [
            { isCurrent: 'desc' },
            { startYear: { sort: 'desc', nulls: 'last' } },
            { id: 'asc' },
          ],
          take: 1,
          select: {
            companyRaw: true,
            titleRaw: true,
            sector: { select: { name: true } },
            company: { select: { sector: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);
  return {
    items: rows.map((row) => ({
      userId: row.id,
      name: row.name,
      graduationYear: row.memberships[0]?.graduationYear ?? null,
      position: row.positions[0]
        ? {
            company: row.positions[0].companyRaw,
            title: row.positions[0].titleRaw,
            sector: row.positions[0].sector?.name ?? row.positions[0].company?.sector?.name ?? null,
          }
        : null,
    })),
    page: filter.page,
    total,
    hasMore: filter.page * PAGE_SIZE < total,
  };
}

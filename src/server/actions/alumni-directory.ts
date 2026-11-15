'use server';

import {
  alumniSearchSchema,
  alumniVisibilitySchema,
  type AlumniSearch,
  type AlumniVisibilityInput,
} from '@/contracts/alumni-directory';
import { actionOk, parseInput } from '@/lib/action-result';
import { codedForbidden } from '@/lib/errors';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireUser, requireVerifiedMember } from '../permissions';
import { loadActor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import { evaluateAccess } from '../rules/authorization';
import { searchAlumni as search } from '../services/alumni-directory';

export async function searchAlumni(input: AlumniSearch) {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(alumniSearchSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await search(getDb(), actor, parsed.data));
  } catch (error) {
    return failAction(error, 'searchAlumni');
  }
}

export async function getAlumniVisibility() {
  try {
    const actor = await requireUser();
    const [profile, member] = await Promise.all([
      getDb().profile.findUnique({
        where: { userId: actor.userId },
        select: { alumniDirectoryVisible: true },
      }),
      getDb().membership.findFirst({
        where: {
          userId: actor.userId,
          role: 'ALUMNI',
          endedAt: null,
          verificationStatus: { not: 'REJECTED' },
        },
        select: { id: true },
      }),
    ]);
    return actionOk({
      visible: profile?.alumniDirectoryVisible ?? false,
      eligible: Boolean(member),
    });
  } catch (error) {
    return failAction(error, 'getAlumniVisibility');
  }
}

export async function setAlumniVisibility(input: AlumniVisibilityInput) {
  try {
    const actor = await requireUser();
    const parsed = parseInput(alumniVisibilitySchema, input);
    if (!parsed.ok) return parsed.failure;
    const db = getDb();
    return actionOk(
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
        const current = await loadActor(tx, actor.userId, new Date());
        const access = evaluateAccess(current?.facts ?? null, { action: 'selfProfile' });
        if (!access.allowed) throw errorForDenyReason(access.reason);
        const member = await tx.membership.findFirst({
          where: {
            userId: actor.userId,
            role: 'ALUMNI',
            endedAt: null,
            verificationStatus: { not: 'REJECTED' },
          },
          select: { id: true },
        });
        if (!member) throw codedForbidden('AUTH_FORBIDDEN');
        const row = await tx.profile.upsert({
          where: { userId: actor.userId },
          create: { userId: actor.userId, alumniDirectoryVisible: parsed.data.visible },
          update: { alumniDirectoryVisible: parsed.data.visible },
          select: { alumniDirectoryVisible: true },
        });
        return { visible: row.alumniDirectoryVisible, eligible: true };
      }),
    );
  } catch (error) {
    return failAction(error, 'setAlumniVisibility');
  }
}

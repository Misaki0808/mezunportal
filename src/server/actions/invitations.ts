'use server';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';
import { getAuthEnv } from '@/lib/env';
import { getDb } from '../db';
import { requireAdmin } from '../permissions';
import { invitationTextSchema, inviteUsers } from '../services/invitations';

export async function sendInvitations(input: string) {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(invitationTextSchema, input);
    if (!parsed.ok) return parsed.failure;
    const env = getAuthEnv();
    return actionOk(
      await inviteUsers({ db: getDb(), secret: env.BETTER_AUTH_SECRET }, actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

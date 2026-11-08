'use server';
import { actionOk } from '@/lib/action-result';
import { failAction } from '../fail-action';
import { getAuthEnv } from '@/lib/env';
import { getDb } from '../db';
import { requireAdmin } from '../permissions';
import { inviteUsers } from '../services/invitations';

export async function sendInvitations(input: string) {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const env = getAuthEnv();
    return actionOk(
      await inviteUsers({ db: getDb(), secret: env.BETTER_AUTH_SECRET }, actor.userId, input),
    );
  } catch (error) {
    return failAction(error);
  }
}

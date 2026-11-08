'use server';
import { actionFailure, actionOk } from '@/lib/action-result';
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
    return actionFailure(error);
  }
}

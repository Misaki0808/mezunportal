'use server';
import { getUserDetailSchema } from '@/contracts/admin-users';
import { myPhotoState, photoModerationState } from '../services/profile-photo-state';
import { removeProfilePhotoSchema } from '@/contracts/profile-photo';
import { actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import { getStorage } from '../external/storage';
import { requireAnyAdmin, requireUser } from '../permissions';
import { failAction } from '../fail-action';
import { moderateProfilePhoto } from '../services/profile-photo';
export async function removeProfilePhoto(input: { userId: string; reason: string }) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(removeProfilePhotoSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await moderateProfilePhoto({ db: getDb(), storage: getStorage() }, actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error, 'removeProfilePhoto');
  }
}

export async function getMyPhotoState() {
  try {
    const actor = await requireUser();
    return actionOk(await myPhotoState(getDb(), actor.userId));
  } catch (error) {
    return failAction(error, 'getMyPhotoState');
  }
}
export async function getPhotoModerationState(input: { userId: string }) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(getUserDetailSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await photoModerationState(getDb(), actor.userId, parsed.data.userId));
  } catch (error) {
    return failAction(error, 'getPhotoModerationState');
  }
}

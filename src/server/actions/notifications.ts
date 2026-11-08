'use server';
import {
  setNotificationPreferencesSchema,
  type NotificationPreferences,
  type SetNotificationPreferencesInput,
} from '@/contracts/notifications';
import type { ActionResult } from '@/contracts/result';
import { actionFailure, actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '@/server/db';
import { requireUser } from '@/server/permissions';
import * as preferences from '@/server/services/notification-preferences';

export async function getMyNotificationPreferences(): Promise<
  ActionResult<NotificationPreferences>
> {
  try {
    const actor = await requireUser();
    return actionOk(await preferences.getNotificationPreferences(getDb(), actor.userId));
  } catch (error) {
    return actionFailure(error);
  }
}
export async function updateMyNotificationPreferences(
  input: SetNotificationPreferencesInput,
): Promise<ActionResult<NotificationPreferences>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(setNotificationPreferencesSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await preferences.setNotificationPreferences(getDb(), actor.userId, parsed.data),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

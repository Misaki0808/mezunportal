'use server';
import {
  applicationFollowSchema,
  applicationScopeSchema,
  type ApplicationCalendar,
  type ApplicationFollowInput,
  type ApplicationScope,
} from '@/contracts/application-window';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireVerifiedMember } from '../permissions';
import * as service from '../services/application-window';
export async function getApplicationCalendar(
  input: ApplicationScope,
): Promise<ActionResult<ApplicationCalendar>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(applicationScopeSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.getApplicationCalendar(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function setApplicationFollow(
  input: ApplicationFollowInput,
): Promise<ActionResult<{ following: boolean }>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    const parsed = parseInput(applicationFollowSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.setApplicationFollow(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

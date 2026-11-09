'use server';
import {
  selectSkillGoalSchema,
  type SelectSkillGoalInput,
  type SkillGapResult,
} from '@/contracts/skill-gap';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireVerifiedMember } from '../permissions';
import * as service from '../services/skill-gap';
export async function getSkillGap(): Promise<ActionResult<SkillGapResult>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    return actionOk(await service.getSkillGap(getDb(), actor.userId));
  } catch (error) {
    return failAction(error);
  }
}
export async function listSkillGapTitles(): Promise<ActionResult<{ id: string; name: string }[]>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    return actionOk(await service.listSkillGapTitles(getDb(), actor.userId));
  } catch (error) {
    return failAction(error);
  }
}
export async function selectSkillGoal(
  input: SelectSkillGoalInput,
): Promise<ActionResult<{ saved: true }>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    const parsed = parseInput(selectSkillGoalSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.selectSkillGoal(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

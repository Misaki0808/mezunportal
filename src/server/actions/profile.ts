'use server';

import {
  listProfileTagsSchema,
  saveOnboardingStepSchema,
  skipOnboardingStepSchema,
  type ListProfileTagsInput,
  type OnboardingState,
  type ProfileTagsOutput,
  type SaveOnboardingStepInput,
  type SkipOnboardingStepInput,
} from '@/contracts/profile';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';
import { getDb } from '../db';
import * as profile from '../services/profile';
import { requireUser } from '../permissions';

/** Oturum → sözleşme doğrulaması → yalnız oturumdaki kullanıcının profili. */
export async function getOnboardingState(): Promise<ActionResult<OnboardingState>> {
  try {
    const actor = await requireUser();
    return actionOk(await profile.getOnboardingState(getDb(), actor.userId));
  } catch (error) {
    return failAction(error);
  }
}
export async function listProfileTags(
  input: ListProfileTagsInput,
): Promise<ActionResult<ProfileTagsOutput>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(listProfileTagsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await profile.listProfileTags(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function saveOnboardingStep(
  input: SaveOnboardingStepInput,
): Promise<ActionResult<OnboardingState>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(saveOnboardingStepSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await profile.saveOnboardingStep(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function skipOnboardingStep(
  input: SkipOnboardingStepInput,
): Promise<ActionResult<OnboardingState>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(skipOnboardingStepSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await profile.skipOnboardingStep(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

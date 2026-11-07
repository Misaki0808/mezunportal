'use server';

import type {
  ListProfileTagsInput,
  OnboardingState,
  ProfileTagsOutput,
  SaveOnboardingStepInput,
} from '@/contracts/profile';
import type { ActionResult } from '@/contracts/result';
import { NotImplementedError } from '@/lib/not-implemented';
import { requireUser } from '../permissions';

/** Sözleşme taslağı: uygulama ve sunucu doğrulaması sonraki servis işindedir. */
export async function getOnboardingState(): Promise<ActionResult<OnboardingState>> {
  await requireUser();
  throw new NotImplementedError('getOnboardingState');
}
export async function listProfileTags(
  _input: ListProfileTagsInput,
): Promise<ActionResult<ProfileTagsOutput>> {
  await requireUser();
  throw new NotImplementedError('listProfileTags');
}
export async function saveOnboardingStep(
  _input: SaveOnboardingStepInput,
): Promise<ActionResult<OnboardingState>> {
  await requireUser();
  throw new NotImplementedError('saveOnboardingStep');
}

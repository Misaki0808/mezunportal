'use server';

import type {
  ListProfileTagsInput,
  OnboardingState,
  ProfileTagsOutput,
  SaveOnboardingStepInput,
  SkipOnboardingStepInput,
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
  input: ListProfileTagsInput,
): Promise<ActionResult<ProfileTagsOutput>> {
  void input;
  await requireUser();
  throw new NotImplementedError('listProfileTags');
}
export async function saveOnboardingStep(
  input: SaveOnboardingStepInput,
): Promise<ActionResult<OnboardingState>> {
  void input;
  await requireUser();
  throw new NotImplementedError('saveOnboardingStep');
}
export async function skipOnboardingStep(
  input: SkipOnboardingStepInput,
): Promise<ActionResult<OnboardingState>> {
  void input;
  await requireUser();
  throw new NotImplementedError('skipOnboardingStep');
}

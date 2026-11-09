'use server';
import {
  saveStorySchema,
  storyIdSchema,
  storyConsentSchema,
  reviewStorySchema,
  monthlySelectionSchema,
  storiesScopeSchema,
  type SaveStoryInput,
  type StoryConsentInput,
  type StoryIdInput,
  type ReviewStoryInput,
  type MonthlySelectionInput,
  type StoriesScopeInput,
} from '@/contracts/alumni-story';
import { actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireAnyAdmin, requireVerifiedMember } from '../permissions';
import * as service from '../services/alumni-story';

export async function listMyStories() {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    return actionOk(await service.listMyStories({ db: getDb() }, actor.userId));
  } catch (error) {
    return failAction(error);
  }
}
export async function saveStory(input: SaveStoryInput) {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(saveStorySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.saveStory({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function setStoryConsent(input: StoryConsentInput) {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(storyConsentSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.setStoryConsent({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function submitStory(input: StoryIdInput) {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(storyIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.submitStory({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function listStoryModeration(input: StoriesScopeInput) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(storiesScopeSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.listStoryModeration({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function reviewStory(input: ReviewStoryInput) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(reviewStorySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.reviewStory({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function selectMonthlyAlumnus(input: MonthlySelectionInput) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(monthlySelectionSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.selectMonthlyAlumnus({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function listPublishedStories() {
  try {
    const actor = await requireVerifiedMember();
    return actionOk(await service.listPublishedStories({ db: getDb() }, actor.userId));
  } catch (error) {
    return failAction(error);
  }
}
export async function getPublishedStory(input: StoryIdInput) {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(storyIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.getPublishedStory({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function getCurrentStory() {
  try {
    const actor = await requireVerifiedMember();
    return actionOk(await service.getCurrentStory({ db: getDb() }, actor.userId));
  } catch (error) {
    return failAction(error);
  }
}

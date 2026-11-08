'use server';

import {
  addProfileSkillSchema,
  deleteProfileEntrySchema,
  getProfileSchema,
  removeProfileSkillSchema,
  saveProfileEntrySchema,
  setLinkedinUrlSchema,
  setSocialLinksSchema,
  suggestSkillsSchema,
  updateProfileBasicsSchema,
  type AddProfileSkillInput,
  type DeleteProfileEntryInput,
  type GetProfileInput,
  type MyProfile,
  type ProfileView,
  type RemoveProfileSkillInput,
  type SaveProfileEntryInput,
  type SetLinkedinUrlInput,
  type SetSocialLinksInput,
  type SkillSuggestions,
  type SuggestSkillsInput,
  type UpdateProfileBasicsInput,
} from '@/contracts/profile-content';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';

import { getDb } from '../db';
import { requireUser, requireVerifiedMember } from '../permissions';
import * as content from '../services/profile-content';

/**
 * Profil içeriği eylemleri (hata kodları: `PROFILE_CONTENT_ACTION_ERRORS`). Kimlik yalnız oturumdandır; kendi
 * profilini düzenlemek için doğrulanmış üyelik gerekmez (doğrulanmamış kullanıcı da profilini doldurur),
 * başkasının profilini görmek için gerekir. Başkasının profilinde gizli alanın anahtarı yanıtta yoktur.
 */
const deps = () => ({ db: getDb() });

export async function getMyProfile(): Promise<ActionResult<MyProfile>> {
  try {
    const actor = await requireUser();
    return actionOk(await content.getMyProfile(deps(), actor.userId));
  } catch (error) {
    return failAction(error);
  }
}

/** Başkasının (ya da kendi) profili; görünürlük süzgeci sunucuda. */
export async function getProfile(input: GetProfileInput): Promise<ActionResult<ProfileView>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(getProfileSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await content.getProfile(deps(), actor.userId, parsed.data.userId));
  } catch (error) {
    return failAction(error);
  }
}

export async function updateProfileBasics(
  input: UpdateProfileBasicsInput,
): Promise<ActionResult<MyProfile>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(updateProfileBasicsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await content.updateProfileBasics(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

/** Bağlantı kümesini tamamen değiştirir; yalnız https + izinli alan adı. */
export async function setSocialLinks(input: SetSocialLinksInput): Promise<ActionResult<MyProfile>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(setSocialLinksSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await content.setSocialLinks(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function setLinkedinUrl(input: SetLinkedinUrlInput): Promise<ActionResult<MyProfile>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(setLinkedinUrlSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await content.setLinkedinUrl(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function saveProfileEntry(
  input: SaveProfileEntryInput,
): Promise<ActionResult<MyProfile>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(saveProfileEntrySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await content.saveProfileEntry(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function deleteProfileEntry(
  input: DeleteProfileEntryInput,
): Promise<ActionResult<MyProfile>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(deleteProfileEntrySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await content.deleteProfileEntry(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function addProfileSkill(
  input: AddProfileSkillInput,
): Promise<ActionResult<MyProfile>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(addProfileSkillSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await content.addProfileSkill(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function removeProfileSkill(
  input: RemoveProfileSkillInput,
): Promise<ActionResult<MyProfile>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(removeProfileSkillSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await content.removeProfileSkill(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function suggestSkills(
  input: SuggestSkillsInput,
): Promise<ActionResult<SkillSuggestions>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(suggestSkillsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await content.suggestSkills(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

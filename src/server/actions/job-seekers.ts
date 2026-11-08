'use server';

import {
  getMySeekerSettingsSchema,
  setSeekerSettingsSchema,
  getMyHiringDeclarationSchema,
  setHiringDeclarationSchema,
  searchSeekersSchema,
  previewSeekerContactSchema,
  requestSeekerContactSchema,
  type GetMySeekerSettingsInput,
  type SetSeekerSettingsInput,
  type GetMyHiringDeclarationInput,
  type SetHiringDeclarationInput,
  type SearchSeekersInput,
  type PreviewSeekerContactInput,
  type RequestSeekerContactInput,
} from '@/contracts/job-seekers';
import { actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireVerifiedMember } from '../permissions';
import * as seekers from '../services/job-seekers';

const deps = () => ({ db: getDb() });

export async function getMySeekerSettings(input: GetMySeekerSettingsInput = {}) {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    const parsed = parseInput(getMySeekerSettingsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await seekers.getMySeekerSettings(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function setSeekerSettings(input: SetSeekerSettingsInput) {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    const parsed = parseInput(setSeekerSettingsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await seekers.setSeekerSettings(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function getMyHiringDeclaration(input: GetMyHiringDeclarationInput = {}) {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(getMyHiringDeclarationSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await seekers.getMyHiringDeclaration(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function setHiringDeclaration(input: SetHiringDeclarationInput) {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(setHiringDeclarationSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await seekers.setHiringDeclaration(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function searchSeekers(input: SearchSeekersInput = {}) {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(searchSeekersSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await seekers.searchSeekers(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function previewSeekerContact(input: PreviewSeekerContactInput) {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(previewSeekerContactSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await seekers.previewSeekerContact(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}
export async function requestSeekerContact(input: RequestSeekerContactInput) {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(requestSeekerContactSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await seekers.requestSeekerContact(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

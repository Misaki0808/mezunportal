'use server';

import {
  getMentorEntryPointsSchema,
  searchMentorsSchema,
  type GetMentorEntryPointsInput,
  type MentorEntryPoints,
  type MentorPage,
  type SearchMentorsInput,
  type SimilarMentors,
} from '@/contracts/mentor-directory';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';

import { getDb } from '../db';
import { requireVerifiedMember } from '../permissions';
import * as directory from '../services/mentor-directory';

/**
 * Mentor dizini (hata kodları: `MENTOR_DIRECTORY_ACTION_ERRORS`). Önce oturum ve doğrulanmış üyelik; kapsam (K-07)
 * oturumdaki kullanıcıdan sunucuda çözülür, istemci kimliği/kapsamı alınmaz.
 */
export async function searchMentors(input: SearchMentorsInput): Promise<ActionResult<MentorPage>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(searchMentorsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await directory.searchMentors({ db: getDb() }, actor, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

/** "Sana benzer yol izleyenler": en çok 5 müsait mentor, gerekçe etiketleriyle. */
export async function getSimilarMentors(): Promise<ActionResult<SimilarMentors>> {
  try {
    const actor = await requireVerifiedMember();
    return actionOk(await directory.getSimilarMentors({ db: getDb() }, actor));
  } catch (error) {
    return failAction(error);
  }
}

/** Profilden randevu / CV incelemesi / iletişim talebi uygunluk bayrakları (talep eylemleri kendi kartlarında). */
export async function getMentorEntryPoints(
  input: GetMentorEntryPointsInput,
): Promise<ActionResult<MentorEntryPoints>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(getMentorEntryPointsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await directory.getMentorEntryPoints({ db: getDb() }, actor, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

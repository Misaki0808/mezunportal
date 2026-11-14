'use server';

import {
  searchExperiencesSchema,
  type SearchExperiencesInput,
  type SearchPage,
  type SearchSectors,
} from '@/contracts/search';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';

import { getDb } from '../db';
import { requireVerifiedMember } from '../permissions';
import * as search from '../services/search';

/**
 * Deneyim arama (hata kodları: `SEARCH_ACTION_ERRORS`). Önce oturum ve doğrulanmış üyelik; kapsam (K-07)
 * oturumdaki kullanıcıdan sunucuda çözülür. Sorgu metni loglanmaz ve metriklere yazılmaz.
 */
export async function searchExperiences(
  input: SearchExperiencesInput,
): Promise<ActionResult<SearchPage>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(searchExperiencesSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await search.searchExperiences({ db: getDb() }, actor, parsed.data));
  } catch (error) {
    return failAction(error, 'searchExperiences');
  }
}

/** Sektör süzgeci seçenekleri. */
export async function listSearchSectors(): Promise<ActionResult<SearchSectors>> {
  try {
    const actor = await requireVerifiedMember();
    return actionOk(await search.listSearchSectors({ db: getDb() }, actor));
  } catch (error) {
    return failAction(error, 'listSearchSectors');
  }
}

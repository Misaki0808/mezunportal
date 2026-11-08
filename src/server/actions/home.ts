'use server';

import type { HomeSummary } from '@/contracts/home';
import type { ActionResult } from '@/contracts/result';
import { actionOk } from '@/lib/action-result';
import { failAction } from '../fail-action';

import { getDb } from '../db';
import { requireVerifiedMember } from '../permissions';
import { getHomeSummary as loadSummary } from '../services/home';
import { requireConsent } from '../services/privacy';

/** Ana sayfa panosu (hata kodları: `HOME_ACTION_ERRORS`): kimlik oturumdan gelir, girdi yoktur. */
export async function getHomeSummary(): Promise<ActionResult<HomeSummary>> {
  try {
    const actor = await requireVerifiedMember();
    await requireConsent(getDb(), actor.userId);
    return actionOk(await loadSummary({ db: getDb() }, actor.userId));
  } catch (error) {
    return failAction(error);
  }
}

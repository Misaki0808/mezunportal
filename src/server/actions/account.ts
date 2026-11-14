'use server';

import {
  updateMyNameSchema,
  type MyAccountName,
  type UpdateMyNameInput,
  type UpdateMyNameOutput,
} from '@/contracts/account-name';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';

import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireUser } from '../permissions';
import * as accountName from '../services/account-name';

/**
 * Hesap adı eylemleri (hata kodları: `ACCOUNT_NAME_ACTION_ERRORS`). Kimlik yalnız oturumdandır; girdide kullanıcı kimliği
 * yoktur. Doğrulanmamış kullanıcı da adını düzeltir (ilk girişte e-postadan türetilen ad ilk iş düzeltilebilmeli).
 */
const deps = () => ({ db: getDb() });

export async function getMyAccountName(): Promise<ActionResult<MyAccountName>> {
  try {
    const actor = await requireUser();
    return actionOk(await accountName.getMyAccountName(deps(), actor.userId));
  } catch (error) {
    return failAction(error, 'getMyAccountName');
  }
}

export async function updateMyName(
  input: UpdateMyNameInput,
): Promise<ActionResult<UpdateMyNameOutput>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(updateMyNameSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await accountName.updateMyName(deps(), actor.userId, parsed.data.name));
  } catch (error) {
    return failAction(error, 'updateMyName');
  }
}

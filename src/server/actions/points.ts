'use server';

import {
  decideSuspicionSchema,
  getMyContributionSchema,
  listPointEntriesSchema,
  listSuspicionFlagsSchema,
  requestPointBackfillSchema,
  revokePointEntrySchema,
  updatePointRuleSchema,
  type ContributionOverview,
  type DecideSuspicionInput,
  type DecideSuspicionOutput,
  type GetMyContributionInput,
  type ListPointEntriesInput,
  type ListSuspicionFlagsInput,
  type PointEntryPage,
  type PointRuleView,
  type RequestPointBackfillInput,
  type RequestPointBackfillOutput,
  type RevokePointEntryInput,
  type RevokePointEntryOutput,
  type SuspicionFlagPage,
  type UpdatePointRuleInput,
} from '@/contracts/points';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';

import { getDb } from '../db';
import { enqueuePointBackfill } from '../jobs/points';
import { requireAdmin, requireVerifiedMember } from '../permissions';
import * as admin from '../services/points-admin';
import * as points from '../services/points';
import { requireConsent } from '../services/privacy';

/**
 * Puan motoru eylemleri (hata kodları: `POINTS_ACTION_ERRORS`; erişim: `POINT_ACTION_ACCESS`). Sıra: koruma → Zod →
 * servis; yönetici servisleri yetkiyi işlemin içinde yeniden yükler. Katkı puanı yalnız sahibine açıktır.
 */
export async function getMyContribution(
  input: GetMyContributionInput = {},
): Promise<ActionResult<ContributionOverview>> {
  try {
    const actor = await requireVerifiedMember();
    await requireConsent(getDb(), actor.userId);
    const parsed = parseInput(getMyContributionSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await points.getMyContribution({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'getMyContribution');
  }
}

export async function listPointRules(): Promise<ActionResult<PointRuleView[]>> {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    return actionOk(await admin.listPointRules({ db: getDb() }, actor.userId));
  } catch (error) {
    return failAction(error, 'listPointRules');
  }
}

export async function updatePointRule(
  input: UpdatePointRuleInput,
): Promise<ActionResult<PointRuleView>> {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(updatePointRuleSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await admin.updatePointRule({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'updatePointRule');
  }
}

export async function listPointEntries(
  input: ListPointEntriesInput,
): Promise<ActionResult<PointEntryPage>> {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(listPointEntriesSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await admin.listPointEntries({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'listPointEntries');
  }
}

export async function revokePointEntry(
  input: RevokePointEntryInput,
): Promise<ActionResult<RevokePointEntryOutput>> {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(revokePointEntrySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await admin.revokePointEntry({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'revokePointEntry');
  }
}

export async function listSuspicionFlags(
  input: ListSuspicionFlagsInput,
): Promise<ActionResult<SuspicionFlagPage>> {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(listSuspicionFlagsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await admin.listSuspicionFlags({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'listSuspicionFlags');
  }
}

export async function decideSuspicion(
  input: DecideSuspicionInput,
): Promise<ActionResult<DecideSuspicionOutput>> {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(decideSuspicionSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await admin.decideSuspicion({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'decideSuspicion');
  }
}

export async function requestPointBackfill(
  input: RequestPointBackfillInput = {},
): Promise<ActionResult<RequestPointBackfillOutput>> {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(requestPointBackfillSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await admin.requestPointBackfill(
        { db: getDb(), enqueueBackfill: enqueuePointBackfill },
        actor.userId,
        parsed.data,
      ),
    );
  } catch (error) {
    return failAction(error, 'requestPointBackfill');
  }
}

'use server';

import {
  listInboxInputSchema,
  markInboxReadInputSchema,
  type InboxPage,
  type ListInboxInput,
  type MarkInboxReadInput,
} from '@/contracts/inbox';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';
import { getDb } from '../db';
import { requireUser } from '../permissions';
import * as inbox from '../services/inbox';

/** Uygulama içi bildirim kutusu (hata kodları: `INBOX_ACTION_ERRORS`): kimlik yalnız oturumdan gelir, başkasının kutusu istenemez. */
export async function getMyInbox(input: ListInboxInput = {}): Promise<ActionResult<InboxPage>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(listInboxInputSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await inbox.listMyInbox({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

/** Seçili bildirimleri okundu yapar; yalnız çağıranın kayıtları değişir (rozeti istemci kendi isteğiyle tazeler). */
export async function markInboxRead(
  input: MarkInboxReadInput,
): Promise<ActionResult<{ marked: number }>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(markInboxReadInputSchema, input);
    if (!parsed.ok) return parsed.failure;
    const result = await inbox.markInboxRead({ db: getDb() }, actor.userId, parsed.data);
    return actionOk(result);
  } catch (error) {
    return failAction(error);
  }
}

export async function markAllInboxRead(): Promise<ActionResult<{ marked: number }>> {
  try {
    const actor = await requireUser();
    const result = await inbox.markAllInboxRead({ db: getDb() }, actor.userId);
    return actionOk(result);
  } catch (error) {
    return failAction(error);
  }
}

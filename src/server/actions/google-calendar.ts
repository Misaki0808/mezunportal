'use server';

import {
  disconnectGoogleCalendarSchema,
  getGoogleCalendarStatusSchema,
  type DisconnectGoogleCalendarInput,
  type DisconnectGoogleCalendarOutput,
  type GetGoogleCalendarStatusInput,
  type GoogleCalendarStatus,
} from '@/contracts/google-calendar';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';

import { getDb } from '../db';
import { failAction } from '../fail-action';
import { resetCalendar } from '../external/calendar';
import { requireAdmin } from '../permissions';
import * as connection from '../services/google-calendar-connection';

/**
 * Google Takvim bağlantı eylemleri (kart 174; hata kodları: `GOOGLE_CALENDAR_ACTION_ERRORS`; erişim:
 * `GOOGLE_CALENDAR_ACTION_ACCESS`): yalnız sistem yöneticisi. Bağlama tarayıcı yönlendirmesidir (`/api/google/connect`), eylem değildir.
 */
export async function getGoogleCalendarStatus(
  input: GetGoogleCalendarStatusInput = {},
): Promise<ActionResult<GoogleCalendarStatus>> {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(getGoogleCalendarStatusSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await connection.getGoogleCalendarStatus({ db: getDb() }, actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

export async function disconnectGoogleCalendar(
  input: DisconnectGoogleCalendarInput = {},
): Promise<ActionResult<DisconnectGoogleCalendarOutput>> {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(disconnectGoogleCalendarSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await connection.disconnectGoogleCalendar(
        { db: getDb(), onChanged: resetCalendar },
        actor.userId,
        parsed.data,
      ),
    );
  } catch (error) {
    return failAction(error);
  }
}

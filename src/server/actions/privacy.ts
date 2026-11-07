'use server';

import {
  deleteAccountSchema,
  recordConsentsSchema,
  setFieldVisibilitySchema,
  type ConsentState,
  type DeleteAccountInput,
  type DeleteAccountOutput,
  type FieldVisibilitySettings,
  type RecordConsentsInput,
  type SetFieldVisibilityInput,
} from '@/contracts/privacy';
import type { ActionResult } from '@/contracts/result';
import { actionFailure, actionOk, parseInput } from '@/lib/action-result';

import { getDb } from '../db';
import { getStorage } from '../external/storage';
import { requireUser } from '../permissions';
import { deleteAccount as deleteAccountService } from '../services/accountDeletion';
import * as privacy from '../services/privacy';

/**
 * KVKK sunucu eylemleri: yetki (oturum) → Zod (`src/contracts/privacy.ts`) → servis; beklenen hatalar
 * `ActionResult` olarak döner. Veri dökümü eylem değil, yetki kontrollü rotadır (`DATA_EXPORT_HREF`).
 */

export async function getConsentState(): Promise<ActionResult<ConsentState>> {
  try {
    const actor = await requireUser();
    return actionOk(await privacy.getConsentState(getDb(), actor.userId));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function recordConsents(
  input: RecordConsentsInput,
): Promise<ActionResult<ConsentState>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(recordConsentsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await privacy.recordConsents(getDb(), actor.userId, parsed.data.decisions));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function getFieldVisibility(): Promise<ActionResult<FieldVisibilitySettings>> {
  try {
    const actor = await requireUser();
    return actionOk(await privacy.getFieldVisibility(getDb(), actor.userId));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function setFieldVisibility(
  input: SetFieldVisibilityInput,
): Promise<ActionResult<FieldVisibilitySettings>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(setFieldVisibilitySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await privacy.setFieldVisibility(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Hesabı sil (K-09). Bekleyen belge dosyaları sunucudaki depolama adaptörüyle silinir.
 */
export async function deleteAccount(
  input: DeleteAccountInput,
): Promise<ActionResult<DeleteAccountOutput>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(deleteAccountSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await deleteAccountService(getDb(), actor.userId, parsed.data, {
        removeStoredFiles: async (keys) => {
          const storage = getStorage();
          for (const key of keys) await storage.delete(key);
        },
      }),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

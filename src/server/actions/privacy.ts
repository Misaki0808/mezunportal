'use server';

import type {
  ConsentState,
  DeleteAccountInput,
  DeleteAccountOutput,
  FieldVisibilitySettings,
  RecordConsentsInput,
  SetFieldVisibilityInput,
} from '@/contracts/privacy';
import type { ActionResult } from '@/contracts/result';
import { NotImplementedError } from '@/lib/not-implemented';

/**
 * KVKK sunucu eylemleri — YALNIZ İMZALAR (P1-03 sözleşme PR'ı). Gövdeler servis kartında: oturum →
 * Zod (`src/contracts/privacy.ts`) → servis; hatalar `ActionResult` olarak döner (`PRIVACY_ACTION_ERRORS`).
 * Veri dökümü eylem değil, yetki kontrollü rotadır (`DATA_EXPORT_HREF`).
 */

/** Belge başına rıza durumu ve “onay bekleyen zorunlu belge var mı” (`blocking`). */
export async function getConsentState(): Promise<ActionResult<ConsentState>> {
  throw new NotImplementedError('getConsentState');
}

/** Onay ver / yeni sürümü onayla / isteğe bağlı rızayı geri çek. Her karar yeni satırdır. */
export async function recordConsents(
  input: RecordConsentsInput,
): Promise<ActionResult<ConsentState>> {
  void input;
  throw new NotImplementedError('recordConsents');
}

export async function getFieldVisibility(): Promise<ActionResult<FieldVisibilitySettings>> {
  throw new NotImplementedError('getFieldVisibility');
}

export async function setFieldVisibility(
  input: SetFieldVisibilityInput,
): Promise<ActionResult<FieldVisibilitySettings>> {
  void input;
  throw new NotImplementedError('setFieldVisibility');
}

/** Hesabı sil (K-09: yayınlanmış içerik sil ya da anonimleştir). Tek işlem; oturum düşer. */
export async function deleteAccount(
  input: DeleteAccountInput,
): Promise<ActionResult<DeleteAccountOutput>> {
  void input;
  throw new NotImplementedError('deleteAccount');
}

'use server';

import type {
  CloseContactRequestInput,
  ContactRequestPage,
  ContactRequestStatusOutput,
  ListContactRequestsInput,
  RespondToContactRequestInput,
  SendContactRequestInput,
  SendContactRequestOutput,
} from '@/contracts/contact-request';
import type { ActionResult } from '@/contracts/result';
import { NotImplementedError } from '@/lib/not-implemented';

/**
 * İletişim talebi sunucu eylemleri — YALNIZ İMZALAR (P1-03 sözleşme PR'ı). Hata kodları:
 * `CONTACT_REQUEST_ACTION_ERRORS`. Yetki: talep göndermek doğrulanmış üyelik ister; yanıt/geri alma yalnız
 * hedefin, geri çekme yalnız talep edenin; başkasının talebi `RESOURCE_NOT_FOUND` (varlığı sızmaz).
 * Gönderimde hız sınırı vardır.
 */

export async function sendContactRequest(
  input: SendContactRequestInput,
): Promise<ActionResult<SendContactRequestOutput>> {
  void input;
  throw new NotImplementedError('sendContactRequest');
}

/** Hedef: onayla ya da reddet (gerekçesiz). */
export async function respondToContactRequest(
  input: RespondToContactRequestInput,
): Promise<ActionResult<ContactRequestStatusOutput>> {
  void input;
  throw new NotImplementedError('respondToContactRequest');
}

/** Talep eden: bekleyen talebini geri çeker (`WITHDRAWN`). */
export async function withdrawContactRequest(
  input: CloseContactRequestInput,
): Promise<ActionResult<ContactRequestStatusOutput>> {
  void input;
  throw new NotImplementedError('withdrawContactRequest');
}

/** Hedef: verdiği onayı geri alır (`REVOKED`); açılan alanlar yeniden kapanır. */
export async function revokeContactRequest(
  input: CloseContactRequestInput,
): Promise<ActionResult<ContactRequestStatusOutput>> {
  void input;
  throw new NotImplementedError('revokeContactRequest');
}

export async function listContactRequests(
  input: ListContactRequestsInput,
): Promise<ActionResult<ContactRequestPage>> {
  void input;
  throw new NotImplementedError('listContactRequests');
}

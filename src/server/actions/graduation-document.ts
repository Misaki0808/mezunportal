'use server';

import { actionFailure, actionOk, parseInput } from '@/lib/action-result';
import type { ActionResult } from '@/contracts/result';
import {
  graduationDocumentFormInput,
  graduationDocumentFormSchema,
  listPendingGraduationDocumentsSchema,
  reviewGraduationDocumentSchema,
  type ListPendingGraduationDocumentsInput,
  type PendingGraduationDocumentPage,
  type ReviewGraduationDocumentInput,
  type ReviewGraduationDocumentOutput,
  type UploadGraduationDocumentOutput,
} from '@/contracts/graduation-document';

import { getDb } from '../db';
import { requireUser } from '../permissions';
import * as documents from '../services/graduation-document';
import { documentDeps } from './deps';

/**
 * Mezun belgesi sunucu eylemleri (hata kodları: `GRADUATION_DOCUMENT_ACTION_ERRORS`). Yükleme için oturum;
 * kuyruk ve karar için belgenin bölümünü kapsayan doğrulanmış yönetici (servis içinde, işlemde yeniden
 * doğrulanır); karar işlem kaydına yazılır ve belge dosyası karar anında silinir.
 */

/** `FormData` alanları: `departmentId`, `graduationYear`, `file` (bkz. `graduationDocumentFormSchema`). */
export async function uploadGraduationDocument(
  formData: FormData,
): Promise<ActionResult<UploadGraduationDocumentOutput>> {
  try {
    // Önce kimlik: oturumsuz isteğin gövdesi işlenmez.
    const actor = await requireUser();
    const parsed = parseInput(graduationDocumentFormSchema, graduationDocumentFormInput(formData));
    if (!parsed.ok) return parsed.failure;
    return actionOk(await documents.uploadGraduationDocument(documentDeps(), actor, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

/** Yöneticinin kapsamındaki bekleyen belgeler (başvuran e-postası maskeli). */
export async function listPendingGraduationDocuments(
  input?: ListPendingGraduationDocumentsInput,
): Promise<ActionResult<PendingGraduationDocumentPage>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(listPendingGraduationDocumentsSchema, input ?? {});
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await documents.listPendingGraduationDocuments({ db: getDb() }, actor, parsed.data),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

/** Onay ya da gerekçeli ret; belge dosyası karar anında silinir. */
export async function reviewGraduationDocument(
  input: ReviewGraduationDocumentInput,
): Promise<ActionResult<ReviewGraduationDocumentOutput>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(reviewGraduationDocumentSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await documents.reviewGraduationDocument(documentDeps(), actor, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

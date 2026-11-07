'use server';

import type { ActionResult } from '@/contracts/result';
import type {
  ListPendingGraduationDocumentsInput,
  PendingGraduationDocumentPage,
  ReviewGraduationDocumentInput,
  ReviewGraduationDocumentOutput,
  UploadGraduationDocumentOutput,
} from '@/contracts/graduation-document';
import { NotImplementedError } from '@/lib/not-implemented';

/**
 * Mezun belgesi sunucu eylemleri — YALNIZ İMZALAR (P1-02 sözleşme PR'ı). Hata kodları:
 * `GRADUATION_DOCUMENT_ACTION_ERRORS`. Yetki: yükleme için oturum; kuyruk ve karar için kapsayan yönetici
 * (`requireAdmin`/`requireModerator`); karar işlem kaydına yazılır (`recordAdminAction`).
 */

/** `FormData` alanları: `departmentId`, `graduationYear`, `file` (bkz. `graduationDocumentFormSchema`). */
export async function uploadGraduationDocument(
  formData: FormData,
): Promise<ActionResult<UploadGraduationDocumentOutput>> {
  void formData;
  throw new NotImplementedError('uploadGraduationDocument');
}

/** Yöneticinin kapsamındaki bekleyen belgeler (başvuran e-postası maskeli). */
export async function listPendingGraduationDocuments(
  input?: ListPendingGraduationDocumentsInput,
): Promise<ActionResult<PendingGraduationDocumentPage>> {
  void input;
  throw new NotImplementedError('listPendingGraduationDocuments');
}

/** Onay ya da gerekçeli ret; belge dosyası karar anında silinir. */
export async function reviewGraduationDocument(
  input: ReviewGraduationDocumentInput,
): Promise<ActionResult<ReviewGraduationDocumentOutput>> {
  void input;
  throw new NotImplementedError('reviewGraduationDocument');
}

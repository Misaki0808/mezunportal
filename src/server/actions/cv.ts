'use server';

import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';
import type { ActionResult } from '@/contracts/result';
import {
  applyCvSchema,
  cvIdSchema,
  cvUploadFormInput,
  cvUploadFormSchema,
  dismissInvitationSchema,
  type ApplyCvInput,
  type ApplyCvOutput,
  type CvAvailability,
  type CvIdInput,
  type CvReview,
  type CvStatusOutput,
  type CvUploadOutput,
  type DiscardCvOutput,
  type DismissInvitationInput,
  type ExperienceInvitationsOutput,
} from '@/contracts/cv';

import { requireUser } from '../permissions';
import * as cv from '../services/cv';
import { cvDeps } from './deps';

/**
 * CV ayrıştırma sunucu eylemleri (hata kodları: `CV_ACTION_ERRORS`). Her eylem önce oturumu doğrular; kullanıcı
 * kimliği yalnız oturumdan gelir. Yükleme LLM çağrısı YAPMAZ, `cv.parse` işini kuyruğa yazar; ekran
 * `getCvStatus` ile sonucu izler. LLM çıktısı onay ekranına yalnız ÖNERİ olarak gelir.
 */

/** Yükleme neden kapalı? (sağlayıcı yok, yurt dışı rızası yok, günlük sınır, işlenen CV). */
export async function getCvAvailability(): Promise<ActionResult<CvAvailability>> {
  try {
    const actor = await requireUser();
    return actionOk(await cv.getCvAvailability(cvDeps(), actor));
  } catch (error) {
    return failAction(error, 'getCvAvailability');
  }
}

/** `FormData`: `file` ve isteğe bağlı `source` (PDF ≤ 5 MB, ≤ 6 sayfa; içerik sunucuda yeniden doğrulanır). */
export async function uploadCv(formData: FormData): Promise<ActionResult<CvUploadOutput>> {
  try {
    // Önce kimlik: oturumsuz isteğin gövdesi işlenmez.
    const actor = await requireUser();
    const parsed = parseInput(cvUploadFormSchema, cvUploadFormInput(formData));
    if (!parsed.ok) return parsed.failure;
    return actionOk(await cv.uploadCv(cvDeps(), actor, parsed.data));
  } catch (error) {
    return failAction(error, 'uploadCv');
  }
}

/** Kullanıcının son CV'si (yoksa `null`): sayfa yenilenince kaldığı yerden sürer. */
export async function getLatestCv(): Promise<ActionResult<CvStatusOutput | null>> {
  try {
    const actor = await requireUser();
    return actionOk(await cv.getLatestCv(cvDeps(), actor));
  } catch (error) {
    return failAction(error, 'getLatestCv');
  }
}

export async function getCvStatus(input: CvIdInput): Promise<ActionResult<CvStatusOutput>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(cvIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await cv.getCvStatus(cvDeps(), actor, parsed.data.cvUploadId));
  } catch (error) {
    return failAction(error, 'getCvStatus');
  }
}

/** Onay ekranı: yeni · değişen · çakışan kalemler. Hiçbir şey yazmaz. */
export async function getCvReview(input: CvIdInput): Promise<ActionResult<CvReview>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(cvIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await cv.getCvReview(cvDeps(), actor, parsed.data.cvUploadId));
  } catch (error) {
    return failAction(error, 'getCvReview');
  }
}

/** Kullanıcının kalem kalem kararını tek işlemde uygular; kararı olmayan kalem yazılmaz. */
export async function applyCv(input: ApplyCvInput): Promise<ActionResult<ApplyCvOutput>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(applyCvSchema, input);
    if (!parsed.ok) return parsed.failure;
    const deps = cvDeps();
    const result = await cv.applyCv(deps, actor, parsed.data);
    return actionOk(result);
  } catch (error) {
    return failAction(error, 'applyCv');
  }
}

/** Onay bekleyen sonucu at: çıktı temizlenir, dosya silinir. */
export async function discardCv(input: CvIdInput): Promise<ActionResult<DiscardCvOutput>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(cvIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await cv.discardCv(cvDeps(), actor, parsed.data.cvUploadId));
  } catch (error) {
    return failAction(error, 'discardCv');
  }
}

/** Açık "bu stajı yazmak ister misin?" davetleri. */
export async function listExperienceInvitations(): Promise<
  ActionResult<ExperienceInvitationsOutput>
> {
  try {
    const actor = await requireUser();
    return actionOk(await cv.listExperienceInvitations(cvDeps(), actor));
  } catch (error) {
    return failAction(error, 'listExperienceInvitations');
  }
}

export async function dismissExperienceInvitation(
  input: DismissInvitationInput,
): Promise<ActionResult<{ dismissed: true }>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(dismissInvitationSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await cv.dismissExperienceInvitation(cvDeps(), actor, parsed.data.invitationId),
    );
  } catch (error) {
    return failAction(error, 'dismissExperienceInvitation');
  }
}

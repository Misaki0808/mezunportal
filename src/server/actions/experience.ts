'use server';

import type {
  ExperienceDetail,
  ExperienceIdInput,
  SubmitExperienceOutput,
  ReviewExperienceOutput,
  ExperiencePage,
  ExperienceReportPage,
  ListExperienceReportsInput,
  ListModerationQueueInput,
  ListMyExperiencesInput,
  ReportExperienceInput,
  ReportExperienceOutput,
  ResolveExperienceReportInput,
  ResolveExperienceReportOutput,
  ReviewExperienceInput,
  SaveExperienceDraftInput,
} from '@/contracts/experience';
import type { ActionResult } from '@/contracts/result';
import { NotImplementedError } from '@/lib/not-implemented';
import { requireVerifiedMember } from '../permissions';

/** Sözleşme gövdeleri kapalıdır. Servis kartı: oturum → Zod → sahiplik/üniversite/moderasyon kapsamı. */
export async function saveExperienceDraft(
  input: SaveExperienceDraftInput,
): Promise<ActionResult<ExperienceDetail>> {
  void input;
  await requireVerifiedMember();
  throw new NotImplementedError('saveExperienceDraft');
}
export async function submitExperience(
  input: ExperienceIdInput,
): Promise<ActionResult<SubmitExperienceOutput>> {
  void input;
  await requireVerifiedMember();
  throw new NotImplementedError('submitExperience');
}
/** canModerate(actor, departmentIdAtWrite) ve recordAdminAction aynı işlemde uygulanır. */
export async function reviewExperience(
  input: ReviewExperienceInput,
): Promise<ActionResult<ReviewExperienceOutput>> {
  void input;
  await requireVerifiedMember();
  throw new NotImplementedError('reviewExperience');
}
/** Kullanıcı başına EXPERIENCE_REPORT_RATE_LIMIT; yayımlanmış, aynı üniversitede görünür hedef. */
export async function reportExperience(
  input: ReportExperienceInput,
): Promise<ActionResult<ReportExperienceOutput>> {
  void input;
  await requireVerifiedMember();
  throw new NotImplementedError('reportExperience');
}
export async function listMyExperiences(
  input: ListMyExperiencesInput,
): Promise<ActionResult<ExperiencePage>> {
  void input;
  await requireVerifiedMember();
  throw new NotImplementedError('listMyExperiences');
}
/** Yayınlanmış: K-07 üniversite sınırı; diğer durumlar yalnız sahibi/kapsayan moderatör. Anonim kimlik yok. */
export async function getExperienceDetail(
  input: ExperienceIdInput,
): Promise<ActionResult<ExperienceDetail>> {
  void input;
  await requireVerifiedMember();
  throw new NotImplementedError('getExperienceDetail');
}
export async function listModerationQueue(
  input: ListModerationQueueInput,
): Promise<ActionResult<ExperiencePage>> {
  void input;
  await requireVerifiedMember();
  throw new NotImplementedError('listModerationQueue');
}
export async function listExperienceReports(
  input: ListExperienceReportsInput,
): Promise<ActionResult<ExperienceReportPage>> {
  void input;
  await requireVerifiedMember();
  throw new NotImplementedError('listExperienceReports');
}
export async function resolveExperienceReport(
  input: ResolveExperienceReportInput,
): Promise<ActionResult<ResolveExperienceReportOutput>> {
  void input;
  await requireVerifiedMember();
  throw new NotImplementedError('resolveExperienceReport');
}

'use server';

import {
  getJobPostingSchema,
  previewJobPostingContactSchema,
  requestJobPostingContactSchema,
  jobPostingIdSchema,
  listJobPostingModerationQueueSchema,
  listJobPostingReportsSchema,
  listMyJobPostingsSchema,
  reportJobPostingSchema,
  resolveJobPostingReportSchema,
  reviewJobPostingSchema,
  saveJobPostingDraftSchema,
  searchJobPostingsSchema,
  type CloseJobPostingOutput,
  type GetJobPostingInput,
  type JobPostingDetail,
  type JobPostingFilterOptions,
  type JobPostingContactPreview,
  type PreviewJobPostingContactInput,
  type RequestJobPostingContactInput,
  type RequestJobPostingContactOutput,
  type JobPostingFormContext,
  type JobPostingIdInput,
  type JobPostingModerationPage,
  type JobPostingPage,
  type JobPostingReportPage,
  type ListJobPostingModerationQueueInput,
  type ListJobPostingReportsInput,
  type ListMyJobPostingsInput,
  type MyJobPostingPage,
  type MyJobPostingView,
  type ReportJobPostingInput,
  type ReportJobPostingOutput,
  type ResolveJobPostingReportInput,
  type ResolveJobPostingReportOutput,
  type ReviewJobPostingInput,
  type ReviewJobPostingOutput,
  type SaveJobPostingDraftInput,
  type SearchJobPostingsInput,
  type SubmitJobPostingOutput,
} from '@/contracts/job-postings';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';

import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireAnyAdmin, requireVerifiedMember } from '../permissions';
import * as jobPostings from '../services/job-postings';
import * as contact from '../services/job-posting-contact';
import * as moderation from '../services/job-posting-moderation';

/**
 * İlan eylemleri (P2-04; hata kodları: `JOB_POSTING_ACTION_ERRORS`; erişim: `JOB_POSTING_ACTION_ACCESS`). Sıra: koruma → Zod →
 * servis; servis yetkiyi işlemin içinde yeniden yükler. Yazar eylemleri doğrulanmış mezun/akademisyen ister; okuyucu çıktılarında
 * yazar adı, e-postası ya da telefonu yoktur. Oturumu düşmüşse ortak çıkış (`failAction`) girişe yönlendirir.
 */
const deps = () => ({ db: getDb() });

export async function getJobPostingFormContext(): Promise<ActionResult<JobPostingFormContext>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI', 'ACADEMIC'] });
    return actionOk(await jobPostings.getJobPostingFormContext(deps(), actor.userId));
  } catch (error) {
    return failAction(error);
  }
}

export async function saveJobPostingDraft(
  input: SaveJobPostingDraftInput,
): Promise<ActionResult<MyJobPostingView>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI', 'ACADEMIC'] });
    const parsed = parseInput(saveJobPostingDraftSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await jobPostings.saveJobPostingDraft(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function submitJobPosting(
  input: JobPostingIdInput,
): Promise<ActionResult<SubmitJobPostingOutput>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI', 'ACADEMIC'] });
    const parsed = parseInput(jobPostingIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await jobPostings.submitJobPosting(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function closeJobPosting(
  input: JobPostingIdInput,
): Promise<ActionResult<CloseJobPostingOutput>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI', 'ACADEMIC'] });
    const parsed = parseInput(jobPostingIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await jobPostings.closeJobPosting(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function listMyJobPostings(
  input: ListMyJobPostingsInput = {},
): Promise<ActionResult<MyJobPostingPage>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI', 'ACADEMIC'] });
    const parsed = parseInput(listMyJobPostingsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await jobPostings.listMyJobPostings(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function searchJobPostings(
  input: SearchJobPostingsInput = {},
): Promise<ActionResult<JobPostingPage>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(searchJobPostingsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await jobPostings.searchJobPostings(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function getJobPostingFilterOptions(): Promise<ActionResult<JobPostingFilterOptions>> {
  try {
    const actor = await requireVerifiedMember();
    return actionOk(await jobPostings.getJobPostingFilterOptions(deps(), actor.userId));
  } catch (error) {
    return failAction(error);
  }
}

export async function getJobPosting(
  input: GetJobPostingInput,
): Promise<ActionResult<JobPostingDetail>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(getJobPostingSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await jobPostings.getJobPosting(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function reportJobPosting(
  input: ReportJobPostingInput,
): Promise<ActionResult<ReportJobPostingOutput>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(reportJobPostingSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await jobPostings.reportJobPosting(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function listJobPostingModerationQueue(
  input: ListJobPostingModerationQueueInput = {},
): Promise<ActionResult<JobPostingModerationPage>> {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(listJobPostingModerationQueueSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await moderation.listJobPostingModerationQueue(deps(), actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

export async function reviewJobPosting(
  input: ReviewJobPostingInput,
): Promise<ActionResult<ReviewJobPostingOutput>> {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(reviewJobPostingSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await moderation.reviewJobPosting(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function listJobPostingReports(
  input: ListJobPostingReportsInput = {},
): Promise<ActionResult<JobPostingReportPage>> {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(listJobPostingReportsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await moderation.listJobPostingReports(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function resolveJobPostingReport(
  input: ResolveJobPostingReportInput,
): Promise<ActionResult<ResolveJobPostingReportOutput>> {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(resolveJobPostingReportSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await moderation.resolveJobPostingReport(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

/** İlan üzerinden iletişim önizlemesi (D7): girdi ilan kimliği; çıktıda yazarın adı/kimliği yok. */
export async function previewJobPostingContact(
  input: PreviewJobPostingContactInput,
): Promise<ActionResult<JobPostingContactPreview>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(previewJobPostingContactSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await contact.previewJobPostingContact(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

/** İlanın yazarına iletişim talebi (D7): sunucu yazarı ilandan çözer; mevcut iletişim talebi akışı. */
export async function requestJobPostingContact(
  input: RequestJobPostingContactInput,
): Promise<ActionResult<RequestJobPostingContactOutput>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(requestJobPostingContactSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await contact.requestJobPostingContact(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

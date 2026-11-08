'use server';
// Geçici adaptör: W1'in ilan servisi birleştirildiğinde gerçek eylemlerle değiştirilir.
import type { ActionResult } from '@/contracts/result';
import type {
  SearchJobPostingsInput,
  JobPostingPage,
  JobPostingFilterOptions,
  JobPostingDetail,
  JobPostingFormContext,
  SaveJobPostingDraftInput,
  MyJobPostingView,
  MyJobPostingPage,
  JobPostingIdInput,
  SubmitJobPostingOutput,
  CloseJobPostingOutput,
  JobPostingModerationPage,
  ReviewJobPostingInput,
  ReviewJobPostingOutput,
} from '@/contracts/job-postings';
import { requireVerifiedMember, requireAnyAdmin } from '@/server/permissions';
import { failAction } from '@/server/fail-action';
const unavailable = { ok: false, errorCode: 'SERVER_UNEXPECTED' } as const;
export async function searchJobPostings(
  input: SearchJobPostingsInput,
): Promise<ActionResult<JobPostingPage>> {
  try {
    await requireVerifiedMember();
    return {
      ok: true,
      data: { items: [], total: 0, page: input.page ?? 1, pageSize: input.pageSize ?? 20 },
    };
  } catch (error) {
    return failAction(error);
  }
}
export async function getJobPostingFilterOptions(): Promise<ActionResult<JobPostingFilterOptions>> {
  try {
    await requireVerifiedMember();
    return {
      ok: true,
      data: { organizations: [], departments: [], locations: [], remoteCount: 0 },
    };
  } catch (error) {
    return failAction(error);
  }
}
export async function getJobPosting(_input: {
  id: string;
}): Promise<ActionResult<JobPostingDetail>> {
  try {
    await requireVerifiedMember();
    return { ok: false, errorCode: 'RESOURCE_NOT_FOUND' };
  } catch (error) {
    return failAction(error);
  }
}
export async function getJobPostingFormContext(): Promise<ActionResult<JobPostingFormContext>> {
  try {
    await requireVerifiedMember({ roles: ['ALUMNI', 'ACADEMIC'] });
    return unavailable;
  } catch (error) {
    return failAction(error);
  }
}
export async function saveJobPostingDraft(
  _input: SaveJobPostingDraftInput,
): Promise<ActionResult<MyJobPostingView>> {
  return unavailable;
}
export async function submitJobPosting(
  _input: JobPostingIdInput,
): Promise<ActionResult<SubmitJobPostingOutput>> {
  return unavailable;
}
export async function closeJobPosting(
  _input: JobPostingIdInput,
): Promise<ActionResult<CloseJobPostingOutput>> {
  return unavailable;
}
export async function listMyJobPostings(_input: {
  cursor?: string;
  limit?: number;
}): Promise<ActionResult<MyJobPostingPage>> {
  try {
    await requireVerifiedMember({ roles: ['ALUMNI', 'ACADEMIC'] });
    return unavailable;
  } catch (error) {
    return failAction(error);
  }
}
export async function listJobPostingModerationQueue(
  _input: object,
): Promise<ActionResult<JobPostingModerationPage>> {
  try {
    await requireAnyAdmin();
    return unavailable;
  } catch (error) {
    return failAction(error);
  }
}
export async function reviewJobPosting(
  _input: ReviewJobPostingInput,
): Promise<ActionResult<ReviewJobPostingOutput>> {
  return unavailable;
}

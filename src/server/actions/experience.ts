'use server';

import {
  experienceIdSchema,
  listExperienceReportsSchema,
  listModerationQueueSchema,
  listMyExperiencesSchema,
  reportExperienceSchema,
  resolveExperienceReportSchema,
  reviewExperienceSchema,
  saveExperienceDraftSchema,
  type ExperienceDetail,
  type ExperienceIdInput,
  type SubmitExperienceOutput,
  type ReviewExperienceOutput,
  type ExperiencePage,
  type ExperienceReportPage,
  type ListExperienceReportsInput,
  type ListModerationQueueInput,
  type ListMyExperiencesInput,
  type ReportExperienceInput,
  type ReportExperienceOutput,
  type ResolveExperienceReportInput,
  type ResolveExperienceReportOutput,
  type ReviewExperienceInput,
  type SaveExperienceDraftInput,
} from '@/contracts/experience';
import type { ActionResult } from '@/contracts/result';
import { actionFailure, actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import * as experience from '../services/experience';
import { requireVerifiedMember } from '../permissions';

/** Oturum → Zod → işlem içinde güncel yetki, sahiplik/üniversite/moderasyon kapsamı. */
export async function saveExperienceDraft(
  input: SaveExperienceDraftInput,
): Promise<ActionResult<ExperienceDetail>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(saveExperienceDraftSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await experience.saveExperienceDraft(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}
export async function submitExperience(
  input: ExperienceIdInput,
): Promise<ActionResult<SubmitExperienceOutput>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(experienceIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await experience.submitExperience(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}
/** canModerate(actor, departmentIdAtWrite) ve recordAdminAction aynı işlemde uygulanır. */
export async function reviewExperience(
  input: ReviewExperienceInput,
): Promise<ActionResult<ReviewExperienceOutput>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(reviewExperienceSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await experience.reviewExperience(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}
/** Kullanıcı başına EXPERIENCE_REPORT_RATE_LIMIT; yayımlanmış, aynı üniversitede görünür hedef. */
export async function reportExperience(
  input: ReportExperienceInput,
): Promise<ActionResult<ReportExperienceOutput>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(reportExperienceSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await experience.reportExperience(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}
export async function listMyExperiences(
  input: ListMyExperiencesInput,
): Promise<ActionResult<ExperiencePage>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(listMyExperiencesSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await experience.listMyExperiences(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}
/** Yayınlanmış: K-07 üniversite sınırı; diğer durumlar yalnız sahibi/kapsayan moderatör. Anonim kimlik yok. */
export async function getExperienceDetail(
  input: ExperienceIdInput,
): Promise<ActionResult<ExperienceDetail>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(experienceIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await experience.getExperienceDetail(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}
export async function listModerationQueue(
  input: ListModerationQueueInput,
): Promise<ActionResult<ExperiencePage>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(listModerationQueueSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await experience.listModerationQueue(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}
export async function listExperienceReports(
  input: ListExperienceReportsInput,
): Promise<ActionResult<ExperienceReportPage>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(listExperienceReportsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await experience.listExperienceReports(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}
export async function resolveExperienceReport(
  input: ResolveExperienceReportInput,
): Promise<ActionResult<ResolveExperienceReportOutput>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(resolveExperienceReportSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await experience.resolveExperienceReport(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

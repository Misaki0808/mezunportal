'use server';
import {
  cvReviewSettingsSchema,
  cvReviewTargetSchema,
  createCvReviewRequestSchema,
  answerCvReviewRequestSchema,
  cvReviewRequestIdSchema,
  listCvReviewRequestsSchema,
  type CvReviewSettings,
  type CreateCvReviewRequestInput,
  type AnswerCvReviewRequestInput,
  type ListCvReviewRequestsInput,
} from '@/contracts/cv-review-request';
import { actionFailure, actionOk, parseInput } from '@/lib/action-result';
import { requireVerifiedMember } from '../permissions';
import { getDb } from '../db';
import { getStorage } from '../external/storage';
import { createCvReviewNotifier } from '../services/cv-review-notifier';
import * as service from '../services/cv-review-request';

function deps(): service.CvReviewDeps {
  const db = getDb();
  return {
    db,
    storage: getStorage(),
    notify: createCvReviewNotifier(db),
  };
}
export async function getCvReviewSettings() {
  try {
    const a = await requireVerifiedMember();
    return actionOk(await service.getSettings(deps(), a.userId));
  } catch (e) {
    return actionFailure(e);
  }
}
export async function saveCvReviewSettings(input: CvReviewSettings) {
  try {
    const a = await requireVerifiedMember();
    const p = parseInput(cvReviewSettingsSchema, input);
    if (!p.ok) return p.failure;
    return actionOk(await service.saveSettings(deps(), a.userId, p.data));
  } catch (e) {
    return actionFailure(e);
  }
}
export async function getCvReviewAvailability(input: { mentorId: string }) {
  try {
    const a = await requireVerifiedMember();
    const p = parseInput(cvReviewTargetSchema, input);
    if (!p.ok) return p.failure;
    return actionOk(await service.getAvailability(deps(), a.userId, p.data.mentorId));
  } catch (e) {
    return actionFailure(e);
  }
}
export async function createCvReviewRequest(input: CreateCvReviewRequestInput) {
  try {
    const a = await requireVerifiedMember();
    const p = parseInput(createCvReviewRequestSchema, input);
    if (!p.ok) return p.failure;
    return actionOk(await service.createRequest(deps(), a.userId, p.data));
  } catch (e) {
    return actionFailure(e);
  }
}
export async function answerCvReviewRequest(input: AnswerCvReviewRequestInput) {
  try {
    const a = await requireVerifiedMember();
    const p = parseInput(answerCvReviewRequestSchema, input);
    if (!p.ok) return p.failure;
    return actionOk(await service.answerRequest(deps(), a.userId, p.data));
  } catch (e) {
    return actionFailure(e);
  }
}
export async function markCvReviewHelpful(input: { requestId: string }) {
  try {
    const a = await requireVerifiedMember();
    const p = parseInput(cvReviewRequestIdSchema, input);
    if (!p.ok) return p.failure;
    return actionOk(await service.markHelpful(deps(), a.userId, p.data.requestId));
  } catch (e) {
    return actionFailure(e);
  }
}
export async function listCvReviewRequests(input: ListCvReviewRequestsInput) {
  try {
    const a = await requireVerifiedMember();
    const p = parseInput(listCvReviewRequestsSchema, input);
    if (!p.ok) return p.failure;
    return actionOk(await service.listRequests(deps(), a.userId, p.data));
  } catch (e) {
    return actionFailure(e);
  }
}

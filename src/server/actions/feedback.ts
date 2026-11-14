'use server';
import { appointmentIdSchema } from '@/contracts/appointment';
import { feedbackInputSchema, type FeedbackInput, type FeedbackView } from '@/contracts/feedback';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';
import { codedForbidden } from '@/lib/errors';
import { getDb } from '../db';
import { requireVerifiedMember } from '../permissions';
import * as feedback from '../services/feedback';
import { requireConsent } from '../services/privacy';
import type { Reliability } from '../rules/reliability';

export async function getFeedbackView(appointmentId: string): Promise<ActionResult<FeedbackView>> {
  try {
    const actor = await requireVerifiedMember();
    await requireConsent(getDb(), actor.userId);
    const parsed = parseInput(appointmentIdSchema, { appointmentId });
    if (!parsed.ok) return parsed.failure;
    return actionOk(await feedback.feedbackView(getDb(), actor.userId, parsed.data.appointmentId));
  } catch (error) {
    return failAction(error, 'getFeedbackView');
  }
}
export async function submitSessionFeedback(
  input: FeedbackInput,
): Promise<ActionResult<{ submitted: boolean }>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(feedbackInputSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await feedback.submitFeedback(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'submitSessionFeedback');
  }
}
export async function getMyReliability(): Promise<ActionResult<Reliability>> {
  try {
    const actor = await requireVerifiedMember();
    if (
      !actor.facts.memberships.some(
        (m) => m.role === 'STUDENT' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
      )
    )
      throw codedForbidden('AUTH_FORBIDDEN');
    await requireConsent(getDb(), actor.userId);
    return actionOk(await feedback.studentReliability(getDb(), actor.userId, actor.userId));
  } catch (error) {
    return failAction(error, 'getMyReliability');
  }
}

export async function getFeedbackOverview() {
  try {
    const actor = await requireVerifiedMember();
    await requireConsent(getDb(), actor.userId);
    return actionOk(await feedback.feedbackOverview(getDb(), actor.userId));
  } catch (error) {
    return failAction(error, 'getFeedbackOverview');
  }
}

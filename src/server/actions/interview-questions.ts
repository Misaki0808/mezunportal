'use server';
import {
  interviewQuerySchema,
  type InterviewQuery,
  type InterviewQuestionBank,
} from '@/contracts/interview-questions';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireVerifiedMember } from '../permissions';
import { getInterviewQuestions as search } from '../services/interview-questions';

export async function getInterviewQuestions(
  input: InterviewQuery = {},
): Promise<ActionResult<InterviewQuestionBank>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(interviewQuerySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await search(getDb(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

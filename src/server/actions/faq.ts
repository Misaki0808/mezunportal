'use server';

import {
  answerFaqRequestSchema,
  getFaqItemSchema,
  listFaqModerationQueueSchema,
  listFaqRequestsForMentorSchema,
  listMyFaqRequestsSchema,
  publishFaqSchema,
  redirectFaqSchema,
  rejectFaqSchema,
  searchFaqSchema,
  submitFaqRequestSchema,
  suggestSimilarFaqsSchema,
  type AnswerFaqRequestInput,
  type AnswerFaqRequestOutput,
  type DecideFaqOutput,
  type FaqItemView,
  type FaqModerationPage,
  type FaqSearchPage,
  type FaqSuggestion,
  type GetFaqItemInput,
  type ListFaqModerationQueueInput,
  type ListFaqRequestsForMentorInput,
  type ListMyFaqRequestsInput,
  type MentorFaqRequestPage,
  type MyFaqRequestPage,
  type PublishFaqInput,
  type PublishFaqOutput,
  type RedirectFaqInput,
  type RejectFaqInput,
  type SearchFaqInput,
  type SubmitFaqRequestInput,
  type SubmitFaqRequestOutput,
  type SuggestSimilarFaqsInput,
} from '@/contracts/faq';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';

import { getDb } from '../db';
import { requireAnyAdmin, requireMentor, requireVerifiedMember } from '../permissions';
import * as faq from '../services/faq';
import * as moderation from '../services/faq-moderation';

/**
 * SSS eylemleri (hata kodları: `FAQ_ACTION_ERRORS`; erişim: `FAQ_ACTION_ACCESS`). Sıra: koruma → Zod → servis; servis
 * yetkiyi işlemin içinde yeniden yükler. Hiçbir yanıtta soran, cevap veren ya da moderatör kimliği yoktur.
 */
const deps = () => ({ db: getDb() });

export async function suggestSimilarFaqs(
  input: SuggestSimilarFaqsInput,
): Promise<ActionResult<FaqSuggestion[]>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    const parsed = parseInput(suggestSimilarFaqsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await faq.suggestSimilarFaqs(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'suggestSimilarFaqs');
  }
}

export async function submitFaqRequest(
  input: SubmitFaqRequestInput,
): Promise<ActionResult<SubmitFaqRequestOutput>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    const parsed = parseInput(submitFaqRequestSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await faq.submitFaqRequest(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'submitFaqRequest');
  }
}

export async function listMyFaqRequests(
  input: ListMyFaqRequestsInput = {},
): Promise<ActionResult<MyFaqRequestPage>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    const parsed = parseInput(listMyFaqRequestsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await faq.listMyFaqRequests(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'listMyFaqRequests');
  }
}

export async function listFaqRequestsForMentor(
  input: ListFaqRequestsForMentorInput = {},
): Promise<ActionResult<MentorFaqRequestPage>> {
  try {
    const actor = await requireMentor();
    const parsed = parseInput(listFaqRequestsForMentorSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await faq.listFaqRequestsForMentor(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'listFaqRequestsForMentor');
  }
}

export async function answerFaqRequest(
  input: AnswerFaqRequestInput,
): Promise<ActionResult<AnswerFaqRequestOutput>> {
  try {
    const actor = await requireMentor();
    const parsed = parseInput(answerFaqRequestSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await faq.answerFaqRequest(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'answerFaqRequest');
  }
}

export async function listFaqModerationQueue(
  input: ListFaqModerationQueueInput = {},
): Promise<ActionResult<FaqModerationPage>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(listFaqModerationQueueSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await moderation.listFaqModerationQueue(deps(), admin.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'listFaqModerationQueue');
  }
}

export async function publishFaq(input: PublishFaqInput): Promise<ActionResult<PublishFaqOutput>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(publishFaqSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await moderation.publishFaq(deps(), admin.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'publishFaq');
  }
}

export async function rejectFaq(input: RejectFaqInput): Promise<ActionResult<DecideFaqOutput>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(rejectFaqSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await moderation.rejectFaq(deps(), admin.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'rejectFaq');
  }
}

export async function redirectFaq(input: RedirectFaqInput): Promise<ActionResult<DecideFaqOutput>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(redirectFaqSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await moderation.redirectFaq(deps(), admin.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'redirectFaq');
  }
}

export async function searchFaq(input: SearchFaqInput = {}): Promise<ActionResult<FaqSearchPage>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(searchFaqSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await faq.searchFaq(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'searchFaq');
  }
}

export async function getFaqItem(input: GetFaqItemInput): Promise<ActionResult<FaqItemView>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(getFaqItemSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await faq.getFaqItem(deps(), actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'getFaqItem');
  }
}

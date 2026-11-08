'use server';

import {
  listReferralCandidatesSchema,
  listReferralsSchema,
  proposeReferralSchema,
  respondReferralSchema,
  proposeReferralAcceptanceSchema,
  reviewReferralSchema,
  referralIdSchema,
  type ListReferralsInput,
  type ProposeReferralInput,
  type RespondReferralInput,
  type ProposeReferralAcceptanceInput,
  type ReviewReferralInput,
  type ReferralIdInput,
  type ReferralCandidates,
  type ReferralPage,
  type ReferralResult,
} from '@/contracts/referrals';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireAnyAdmin, requireVerifiedMember } from '../permissions';
import * as service from '../services/referrals';

export async function listReferralCandidates(): Promise<ActionResult<ReferralCandidates>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    return actionOk(
      await service.listReferralCandidates(
        { db: getDb() },
        actor.userId,
        listReferralCandidatesSchema.parse({}),
      ),
    );
  } catch (error) {
    return failAction(error);
  }
}

export async function proposeReferral(
  input: ProposeReferralInput,
): Promise<ActionResult<ReferralResult>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(proposeReferralSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.proposeReferral({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function listMyReferrals(
  input: ListReferralsInput = {},
): Promise<ActionResult<ReferralPage>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(listReferralsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.listMyReferrals({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function respondReferral(
  input: RespondReferralInput,
): Promise<ActionResult<ReferralResult>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    const parsed = parseInput(respondReferralSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.respondReferral({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function proposeReferralAcceptance(
  input: ProposeReferralAcceptanceInput,
): Promise<ActionResult<ReferralResult>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['STUDENT'] });
    const parsed = parseInput(proposeReferralAcceptanceSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await service.proposeReferralAcceptance({ db: getDb() }, actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

export async function respondReferralAcceptance(
  input: RespondReferralInput,
): Promise<ActionResult<ReferralResult>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(respondReferralSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await service.respondReferralAcceptance({ db: getDb() }, actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

export async function listReferralModeration(
  input: ListReferralsInput = {},
): Promise<ActionResult<ReferralPage>> {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(listReferralsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await service.listReferralModeration({ db: getDb() }, actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error);
  }
}

export async function reviewReferral(
  input: ReviewReferralInput,
): Promise<ActionResult<ReferralResult>> {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(reviewReferralSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.reviewReferral({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

export async function cancelReferral(
  input: ReferralIdInput,
): Promise<ActionResult<ReferralResult>> {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(referralIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.cancelReferral({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

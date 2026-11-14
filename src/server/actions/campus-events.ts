'use server';
import { getAuthEnv } from '@/lib/env';
import { actionOk, parseInput } from '@/lib/action-result';
import {
  campusEventIdSchema,
  cancelCampusEventSchema,
  createCampusEventSchema,
  reviewCampusEventSchema,
} from '@/contracts/campus-events';
import { getRequestContext } from '../auth/request-context';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireAnyAdmin, requireVerifiedMember } from '../permissions';
import * as events from '../services/campus-event';

export async function listCampusEvents() {
  try {
    const actor = await requireVerifiedMember();
    return actionOk(await events.listCampusEvents({ db: getDb() }, actor.userId));
  } catch (error) {
    return failAction(error, 'listCampusEvents');
  }
}
export async function listCampusEventModeration() {
  try {
    const actor = await requireAnyAdmin();
    return actionOk(await events.listCampusEventModeration({ db: getDb() }, actor.userId));
  } catch (error) {
    return failAction(error, 'listCampusEventModeration');
  }
}
export async function createCampusEvent(input: unknown) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(createCampusEventSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await events.createCampusEvent({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'createCampusEvent');
  }
}
export async function reviewCampusEvent(input: unknown) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(reviewCampusEventSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await events.reviewCampusEvent({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'reviewCampusEvent');
  }
}
export async function cancelCampusEvent(input: unknown) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(cancelCampusEventSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await events.cancelCampusEvent({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'cancelCampusEvent');
  }
}
export async function registerCampusEvent(input: unknown) {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(campusEventIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await events.registerCampusEvent({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'registerCampusEvent');
  }
}
export async function getCampusEventCode(input: unknown) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(campusEventIdSchema, input);
    if (!parsed.ok) return parsed.failure;
    const env = getAuthEnv();
    return actionOk(
      await events.getCampusEventCode(
        { db: getDb() },
        actor.userId,
        parsed.data,
        env.BETTER_AUTH_SECRET,
        env.APP_URL,
      ),
    );
  } catch (error) {
    return failAction(error, 'getCampusEventCode');
  }
}
export async function checkInCampusEvent(input: unknown) {
  try {
    const actor = await requireVerifiedMember();
    const { clientIp } = await getRequestContext();
    return actionOk(
      await events.checkInCampusEvent(
        { db: getDb() },
        actor.userId,
        input,
        getAuthEnv().BETTER_AUTH_SECRET,
        clientIp,
      ),
    );
  } catch (error) {
    return failAction(error, 'checkInCampusEvent');
  }
}

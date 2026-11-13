'use server';
import {
  awardCycleInputSchema,
  configureAwardCycleSchema,
  recalculateAwardCycleSchema,
  selectYearAlumnusSchema,
  setAwardPublicationSchema,
  type AwardCycleInput,
  type ConfigureAwardCycleInput,
  type RecalculateAwardCycleInput,
  type SelectYearAlumnusInput,
  type SetAwardPublicationInput,
} from '@/contracts/year-alumni';
import { actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireAnyAdmin, requireVerifiedMember } from '../permissions';
import * as service from '../services/year-alumni';

export async function configureAwardCycle(input: ConfigureAwardCycleInput) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(configureAwardCycleSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.configureAwardCycle({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'configureAwardCycle');
  }
}
export async function listAwardCandidates(input: AwardCycleInput) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(awardCycleInputSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.listAwardCandidates({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'listAwardCandidates');
  }
}
export async function recalculateAwardCycle(input: RecalculateAwardCycleInput) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(recalculateAwardCycleSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await service.recalculateAwardCycle({ db: getDb() }, actor.userId, parsed.data),
    );
  } catch (error) {
    return failAction(error, 'recalculateAwardCycle');
  }
}
export async function selectYearAlumnus(input: SelectYearAlumnusInput) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(selectYearAlumnusSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.selectYearAlumnus({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'selectYearAlumnus');
  }
}
export async function listMyAwards() {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    return actionOk(await service.listMyAwards({ db: getDb() }, actor.userId));
  } catch (error) {
    return failAction(error, 'listMyAwards');
  }
}
export async function setAwardPublication(input: SetAwardPublicationInput) {
  try {
    const actor = await requireVerifiedMember({ roles: ['ALUMNI'] });
    const parsed = parseInput(setAwardPublicationSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.setAwardPublication({ db: getDb() }, actor.userId, parsed.data));
  } catch (error) {
    return failAction(error, 'setAwardPublication');
  }
}

'use server';
import {
  companySlugSchema,
  mergeCompaniesSchema,
  searchCompaniesSchema,
  type CompanyDetail,
  type CompanyMergeResult,
  type CompaniesPage,
  type CompanySlugInput,
  type MergeCompaniesInput,
  type SearchCompaniesInput,
} from '@/contracts/companies';
import type { ActionResult } from '@/contracts/result';
import { actionOk, parseInput } from '@/lib/action-result';
import { getDb } from '../db';
import { failAction } from '../fail-action';
import { requireAdmin, requireVerifiedMember } from '../permissions';
import * as service from '../services/companies';

export async function searchCompanies(
  input: SearchCompaniesInput = {},
): Promise<ActionResult<CompaniesPage>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(searchCompaniesSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.searchCompanies({ db: getDb() }, actor.userId, parsed.data.q));
  } catch (error) {
    return failAction(error, 'searchCompanies');
  }
}
export async function getCompany(input: CompanySlugInput): Promise<ActionResult<CompanyDetail>> {
  try {
    const actor = await requireVerifiedMember();
    const parsed = parseInput(companySlugSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await service.getCompany({ db: getDb() }, actor.userId, parsed.data.slug));
  } catch (error) {
    return failAction(error, 'getCompany');
  }
}
export async function mergeCompanies(
  input: MergeCompaniesInput,
): Promise<ActionResult<CompanyMergeResult>> {
  try {
    const actor = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(mergeCompaniesSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await service.mergeCompanies(
        { db: getDb() },
        actor.userId,
        parsed.data.sourceId,
        parsed.data.targetId,
      ),
    );
  } catch (error) {
    return failAction(error, 'mergeCompanies');
  }
}

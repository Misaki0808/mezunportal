'use server';
import { z } from 'zod';
import { actionOk, parseInput } from '@/lib/action-result';
import { idTextSchema } from '@/lib/id-text';
import { failAction } from '../fail-action';
import { getDb } from '../db';
import { requireAnyAdmin } from '../permissions';
import { listAdminFeedback } from '../services/admin-feedback';

const schema = z.object({ before: idTextSchema().optional() }).strict();
export async function getAdminFeedback(input: { before?: string }) {
  try {
    const actor = await requireAnyAdmin();
    const parsed = parseInput(schema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await listAdminFeedback({ db: getDb() }, actor.userId, parsed.data.before));
  } catch (error) {
    return failAction(error, 'getAdminFeedback');
  }
}

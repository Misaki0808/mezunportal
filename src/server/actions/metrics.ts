'use server';

import {
  usageMetricsFilterSchema,
  type UsageMetrics,
  type UsageMetricsFilter,
} from '@/contracts/metrics';
import type { ActionResult } from '@/contracts/result';
import { actionFailure, actionOk, parseInput } from '@/lib/action-result';

import { getDb } from '../db';
import { requireAnyAdmin } from '../permissions';
import * as usage from '../services/usage-metrics';

/**
 * Kullanım metrikleri paneli (hata kodları: `METRICS_ACTION_ERRORS`). Sıra: koruma → Zod → servis; servis yetkiyi
 * işlemin içinde yeniden yükler ve her sorguyu yöneticinin kapsamıyla keser. Excel: `USAGE_EXPORT_HREF` rotası.
 */
export async function getUsageMetrics(
  input: UsageMetricsFilter,
): Promise<ActionResult<UsageMetrics>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(usageMetricsFilterSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await usage.getUsageMetrics({ db: getDb() }, admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

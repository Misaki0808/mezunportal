'use server';

import type {
  AdminOverview,
  AdminReportPage,
  AuditLogPage,
  CreateDictionaryEntryInput,
  DeleteDictionaryEntryInput,
  DictionaryEntryIdOutput,
  DictionaryEntryPage,
  EmploymentReport,
  EmploymentReportFilter,
  ListAdminReportsInput,
  ListAuditLogInput,
  ListDictionaryEntriesInput,
  ListUnmatchedValuesInput,
  ResolveUnmatchedValueInput,
  ResolveUnmatchedValueOutput,
  UnmatchedValuePage,
  UpdateDictionaryEntryInput,
} from '@/contracts/admin';
import type { ActionResult } from '@/contracts/result';
import {
  createDictionaryEntrySchema,
  deleteDictionaryEntrySchema,
  employmentReportFilterSchema,
  listAdminReportsSchema,
  listAuditLogSchema,
  listDictionaryEntriesSchema,
  listUnmatchedValuesSchema,
  resolveUnmatchedValueSchema,
  updateDictionaryEntrySchema,
} from '@/contracts/admin';
import { actionFailure, actionOk, parseInput } from '@/lib/action-result';
import { requireAdmin, requireAnyAdmin } from '../permissions';
import * as dictionary from '../services/admin-dictionary';
import * as employment from '../services/admin-employment';
import * as panel from '../services/admin-panel';
import { adminUserDeps } from './deps';

/**
 * Yönetim paneli sunucu eylemleri (P1-11). Sıra: koruma → Zod → servis (servis yetkiyi işlemin içinde yeniden
 * yükler, kapsam süzgecini uygular, sorgu/yazma yapar; hatalar `ActionResult` olarak döner). Erişim düzeyi her eylemde
 * `ADMIN_ACTION_ACCESS` tablosundadır; sistem yöneticisine özel eylemler `requireAdmin({ kind: 'SYSTEM' })` ister.
 * Yıkıcı/yetki değiştiren her eylem `recordAdminAction` ile AYNI işlemde yazılır. Kullanıcı yönetimi
 * `admin-users.ts`'tedir.
 */

/** Panel girişi: kapsam özeti, yetenekler, bekleyen iş sayıları. */
export async function getAdminOverview(): Promise<ActionResult<AdminOverview>> {
  try {
    const admin = await requireAnyAdmin();

    return actionOk(await panel.getAdminOverview(adminUserDeps(), admin.userId));
  } catch (error) {
    return actionFailure(error);
  }
}

/** Şikâyet kuyruğu (yalnız kapsamdaki bölümler). Karar: P1-07 `resolveExperienceReport`. */
export async function listAdminReports(
  input: ListAdminReportsInput,
): Promise<ActionResult<AdminReportPage>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(listAdminReportsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await panel.listAdminReports(adminUserDeps(), admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

/** Toplu mezun istihdam raporu (küçük hücre bastırma: `REPORT_MIN_GROUP_SIZE`). Excel: `EMPLOYMENT_EXPORT_HREF` rotası. */
export async function getEmploymentReport(
  input: EmploymentReportFilter,
): Promise<ActionResult<EmploymentReport>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(employmentReportFilterSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await employment.getEmploymentReport(adminUserDeps(), admin.userId, parsed.data),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

export async function listDictionaryEntries(
  input: ListDictionaryEntriesInput,
): Promise<ActionResult<DictionaryEntryPage>> {
  try {
    const admin = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(listDictionaryEntriesSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await dictionary.listDictionaryEntries(adminUserDeps(), admin.userId, parsed.data),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

/** `DICTIONARY_CHANGE` işlem kaydı; ad `normalizeName` ile benzersizdir (`DICTIONARY_ENTRY_EXISTS`). */
export async function createDictionaryEntry(
  input: CreateDictionaryEntryInput,
): Promise<ActionResult<DictionaryEntryIdOutput>> {
  try {
    const admin = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(createDictionaryEntrySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await dictionary.createDictionaryEntry(adminUserDeps(), admin.userId, parsed.data),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateDictionaryEntry(
  input: UpdateDictionaryEntryInput,
): Promise<ActionResult<DictionaryEntryIdOutput>> {
  try {
    const admin = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(updateDictionaryEntrySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await dictionary.updateDictionaryEntry(adminUserDeps(), admin.userId, parsed.data),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

/** Gerekçe ve açık onay zorunlu; bağlı profil kalemlerinin sözlük bağı boşalır. */
export async function deleteDictionaryEntry(
  input: DeleteDictionaryEntryInput,
): Promise<ActionResult<DictionaryEntryIdOutput>> {
  try {
    const admin = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(deleteDictionaryEntrySchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await dictionary.deleteDictionaryEntry(adminUserDeps(), admin.userId, parsed.data),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

export async function listUnmatchedValues(
  input: ListUnmatchedValuesInput,
): Promise<ActionResult<UnmatchedValuePage>> {
  try {
    const admin = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(listUnmatchedValuesSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await dictionary.listUnmatchedValues(adminUserDeps(), admin.userId, parsed.data),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

/** `UNMATCHED_RESOLVE` işlem kaydı; bağla/yeni kayıt/at. */
export async function resolveUnmatchedValue(
  input: ResolveUnmatchedValueInput,
): Promise<ActionResult<ResolveUnmatchedValueOutput>> {
  try {
    const admin = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(resolveUnmatchedValueSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(
      await dictionary.resolveUnmatchedValue(adminUserDeps(), admin.userId, parsed.data),
    );
  } catch (error) {
    return actionFailure(error);
  }
}

/** İşlem kaydı görüntüleme (yalnız sistem yöneticisi; kayıt yalnız eklenir, kişisel veri maskeli). */
export async function listAuditLog(input: ListAuditLogInput): Promise<ActionResult<AuditLogPage>> {
  try {
    const admin = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(listAuditLogSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await panel.listAuditLog(adminUserDeps(), admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

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
import { NotImplementedError } from '@/lib/not-implemented';
import { requireAdmin, requireAnyAdmin } from '../permissions';

/**
 * Yönetim paneli sunucu eylemleri — SÖZLEŞME (P1-11). Gövdeler kapalıdır; servis kartı (W2) sırası:
 * koruma → Zod → kapsam süzgeci (`managedDepartmentIds`) → sorgu/yazma. Erişim düzeyi her eylemde
 * `ADMIN_ACTION_ACCESS` tablosundadır; sistem yöneticisine özel eylemler `requireAdmin({ kind: 'SYSTEM' })` ister.
 * Yıkıcı/yetki değiştiren her eylem `recordAdminAction` ile AYNI işlemde yazılır. Kullanıcı yönetimi
 * `admin-users.ts`'tedir.
 */

/** Panel girişi: kapsam özeti, yetenekler, bekleyen iş sayıları. */
export async function getAdminOverview(): Promise<ActionResult<AdminOverview>> {
  await requireAnyAdmin();
  throw new NotImplementedError('getAdminOverview');
}

/** Şikâyet kuyruğu (yalnız kapsamdaki bölümler). Karar: P1-07 `resolveExperienceReport`. */
export async function listAdminReports(
  input: ListAdminReportsInput,
): Promise<ActionResult<AdminReportPage>> {
  void input;
  await requireAnyAdmin();
  throw new NotImplementedError('listAdminReports');
}

/** Toplu mezun istihdam raporu (küçük hücre bastırma: `REPORT_MIN_GROUP_SIZE`). */
export async function getEmploymentReport(
  input: EmploymentReportFilter,
): Promise<ActionResult<EmploymentReport>> {
  void input;
  await requireAnyAdmin();
  throw new NotImplementedError('getEmploymentReport');
}

export async function listDictionaryEntries(
  input: ListDictionaryEntriesInput,
): Promise<ActionResult<DictionaryEntryPage>> {
  void input;
  await requireAdmin({ kind: 'SYSTEM' });
  throw new NotImplementedError('listDictionaryEntries');
}

/** `DICTIONARY_CHANGE` işlem kaydı; ad `normalizeName` ile benzersizdir (`DICTIONARY_ENTRY_EXISTS`). */
export async function createDictionaryEntry(
  input: CreateDictionaryEntryInput,
): Promise<ActionResult<DictionaryEntryIdOutput>> {
  void input;
  await requireAdmin({ kind: 'SYSTEM' });
  throw new NotImplementedError('createDictionaryEntry');
}

export async function updateDictionaryEntry(
  input: UpdateDictionaryEntryInput,
): Promise<ActionResult<DictionaryEntryIdOutput>> {
  void input;
  await requireAdmin({ kind: 'SYSTEM' });
  throw new NotImplementedError('updateDictionaryEntry');
}

export async function deleteDictionaryEntry(
  input: DeleteDictionaryEntryInput,
): Promise<ActionResult<DictionaryEntryIdOutput>> {
  void input;
  await requireAdmin({ kind: 'SYSTEM' });
  throw new NotImplementedError('deleteDictionaryEntry');
}

export async function listUnmatchedValues(
  input: ListUnmatchedValuesInput,
): Promise<ActionResult<UnmatchedValuePage>> {
  void input;
  await requireAdmin({ kind: 'SYSTEM' });
  throw new NotImplementedError('listUnmatchedValues');
}

/** `UNMATCHED_RESOLVE` işlem kaydı; bağla/yeni kayıt/at. */
export async function resolveUnmatchedValue(
  input: ResolveUnmatchedValueInput,
): Promise<ActionResult<ResolveUnmatchedValueOutput>> {
  void input;
  await requireAdmin({ kind: 'SYSTEM' });
  throw new NotImplementedError('resolveUnmatchedValue');
}

/** İşlem kaydı görüntüleme (yalnız sistem yöneticisi; kayıt yalnız eklenir). */
export async function listAuditLog(input: ListAuditLogInput): Promise<ActionResult<AuditLogPage>> {
  void input;
  await requireAdmin({ kind: 'SYSTEM' });
  throw new NotImplementedError('listAuditLog');
}

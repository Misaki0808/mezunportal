'use server';

import type {
  AdminGrantPage,
  AdminUserDetail,
  AdminUserPage,
  CorrectMembershipInput,
  CorrectMembershipOutput,
  GetUserDetailInput,
  GrantAdminInput,
  GrantAdminOutput,
  ListAdminGrantsInput,
  RevokeAdminInput,
  RevokeAdminOutput,
  SearchUsersInput,
  SuspendUserInput,
  SuspendUserOutput,
  UnsuspendUserInput,
  UnsuspendUserOutput,
} from '@/contracts/admin-users';
import type { ActionResult } from '@/contracts/result';
import { NotImplementedError } from '@/lib/not-implemented';
import { requireAdmin, requireAnyAdmin } from '../permissions';

/**
 * Yönetim paneli — kullanıcılar, askıya alma, üyelik düzeltme, yönetici atama — SÖZLEŞME (P1-11).
 * Sunucu kuralları `src/contracts/admin-users.ts` başındadır (kapsam, kendi üzerinde işlem yok, yetkili
 * kullanıcıyı yalnız sistem yöneticisi yönetir, tek işlemde yetki + değişiklik + işlem kaydı).
 */

export async function searchUsers(input: SearchUsersInput): Promise<ActionResult<AdminUserPage>> {
  void input;
  await requireAnyAdmin();
  throw new NotImplementedError('searchUsers');
}

export async function getUserDetail(
  input: GetUserDetailInput,
): Promise<ActionResult<AdminUserDetail>> {
  void input;
  await requireAnyAdmin();
  throw new NotImplementedError('getUserDetail');
}

/** `USER_SUSPEND` (gerekçe zorunlu): ban alanlarını yazar ve oturumları aynı işlemde siler. */
export async function suspendUser(
  input: SuspendUserInput,
): Promise<ActionResult<SuspendUserOutput>> {
  void input;
  await requireAnyAdmin();
  throw new NotImplementedError('suspendUser');
}

/** `USER_UNSUSPEND`. */
export async function unsuspendUser(
  input: UnsuspendUserInput,
): Promise<ActionResult<UnsuspendUserOutput>> {
  void input;
  await requireAnyAdmin();
  throw new NotImplementedError('unsuspendUser');
}

/** `ROLE_CORRECT` (gerekçe zorunlu): bölüm/rol değişirse eski üyelik kapanır, yenisi açılır. */
export async function correctMembership(
  input: CorrectMembershipInput,
): Promise<ActionResult<CorrectMembershipOutput>> {
  void input;
  await requireAnyAdmin();
  throw new NotImplementedError('correctMembership');
}

export async function listAdminGrants(
  input: ListAdminGrantsInput,
): Promise<ActionResult<AdminGrantPage>> {
  void input;
  await requireAdmin({ kind: 'SYSTEM' });
  throw new NotImplementedError('listAdminGrants');
}

/** `ADMIN_GRANT` (yalnız sistem yöneticisi). */
export async function grantAdmin(input: GrantAdminInput): Promise<ActionResult<GrantAdminOutput>> {
  void input;
  await requireAdmin({ kind: 'SYSTEM' });
  throw new NotImplementedError('grantAdmin');
}

/** `ADMIN_REVOKE` (gerekçe zorunlu; kendi yetkini ve son sistem yetkisini kaldıramazsın). */
export async function revokeAdmin(
  input: RevokeAdminInput,
): Promise<ActionResult<RevokeAdminOutput>> {
  void input;
  await requireAdmin({ kind: 'SYSTEM' });
  throw new NotImplementedError('revokeAdmin');
}

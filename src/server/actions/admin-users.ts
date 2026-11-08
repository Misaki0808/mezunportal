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
import {
  correctMembershipSchema,
  grantAdminSchema,
  revokeAdminSchema,
  suspendUserSchema,
  unsuspendUserSchema,
} from '@/contracts/admin-users';
import type { ActionResult } from '@/contracts/result';
import { actionFailure, actionOk, parseInput } from '@/lib/action-result';
import { NotImplementedError } from '@/lib/not-implemented';
import { requireAdmin, requireAnyAdmin } from '../permissions';
import * as users from '../services/admin-users';
import { adminUserDeps } from './deps';

/**
 * Yönetim paneli — kullanıcılar, askıya alma, üyelik düzeltme, yönetici atama (P1-11).
 * Sunucu kuralları `src/contracts/admin-users.ts` başındadır (kapsam, kendi üzerinde işlem yok, yetkili
 * kullanıcıyı yalnız sistem yöneticisi yönetir, tek işlemde yetki + değişiklik + işlem kaydı).
 * Gövdesi YAZILMIŞ olanlar: `suspendUser`, `unsuspendUser`, `correctMembership`, `grantAdmin`, `revokeAdmin`
 * (sıra: koruma → Zod → servis; hatalar `ActionResult` olarak döner). Sorgu eylemleri (`searchUsers`,
 * `getUserDetail`, `listAdminGrants`) panel servisi (W2) gövdesini bekler.
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
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(suspendUserSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await users.suspendUser(adminUserDeps(), admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

/** `USER_UNSUSPEND`. */
export async function unsuspendUser(
  input: UnsuspendUserInput,
): Promise<ActionResult<UnsuspendUserOutput>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(unsuspendUserSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await users.unsuspendUser(adminUserDeps(), admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

/** `ROLE_CORRECT` (gerekçe zorunlu): bölüm/rol değişirse eski üyelik kapanır, yenisi açılır. */
export async function correctMembership(
  input: CorrectMembershipInput,
): Promise<ActionResult<CorrectMembershipOutput>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(correctMembershipSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await users.correctMembership(adminUserDeps(), admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
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
  try {
    const admin = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(grantAdminSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await users.grantAdmin(adminUserDeps(), admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

/** `ADMIN_REVOKE` (gerekçe zorunlu; kendi yetkini ve son sistem yetkisini kaldıramazsın). */
export async function revokeAdmin(
  input: RevokeAdminInput,
): Promise<ActionResult<RevokeAdminOutput>> {
  try {
    const admin = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(revokeAdminSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await users.revokeAdmin(adminUserDeps(), admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

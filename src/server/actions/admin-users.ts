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
  getUserDetailSchema,
  grantAdminSchema,
  listAdminGrantsSchema,
  revokeAdminSchema,
  searchUsersSchema,
  suspendUserSchema,
  unsuspendUserSchema,
} from '@/contracts/admin-users';
import type { ActionResult } from '@/contracts/result';
import { actionFailure, actionOk, parseInput } from '@/lib/action-result';
import { requireAdmin, requireAnyAdmin } from '../permissions';
import * as panel from '../services/admin-panel';
import * as users from '../services/admin-users';
import { adminUserDeps } from './deps';

/**
 * Yönetim paneli — kullanıcılar, askıya alma, üyelik düzeltme, yönetici atama (P1-11).
 * Sunucu kuralları `src/contracts/admin-users.ts` başındadır (kapsam, kendi üzerinde işlem yok, yetkili
 * kullanıcıyı yalnız sistem yöneticisi yönetir, tek işlemde yetki + değişiklik + işlem kaydı).
 * Sıra: koruma → Zod → servis; hatalar `ActionResult` olarak döner. Sorgu eylemleri (`searchUsers`,
 * `getUserDetail`, `listAdminGrants`) `services/admin-panel.ts`'tedir: telefon/e-posta çıktıda yalnız maskeli.
 */

/** Kapsamdaki kullanıcıları arar; telefon/e-posta maskeli. */
export async function searchUsers(input: SearchUsersInput): Promise<ActionResult<AdminUserPage>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(searchUsersSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await panel.searchUsers(adminUserDeps(), admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
}

export async function getUserDetail(
  input: GetUserDetailInput,
): Promise<ActionResult<AdminUserDetail>> {
  try {
    const admin = await requireAnyAdmin();
    const parsed = parseInput(getUserDetailSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await panel.getUserDetail(adminUserDeps(), admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
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
  try {
    const admin = await requireAdmin({ kind: 'SYSTEM' });
    const parsed = parseInput(listAdminGrantsSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await panel.listAdminGrants(adminUserDeps(), admin.userId, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }
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

import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import {
  ADMIN_LEVELS,
  adminConfirmation,
  maskedAdminEmailSchema,
  maskedAdminPhoneSchema,
  INVALID,
  adminId,
  adminPageInput,
  adminReason,
  adminSearchText,
} from './admin';

/**
 * Yönetim paneli — kullanıcılar, askıya alma, üyelik düzeltme ve yönetici atama sözleşmesi (P1-11; D5, D6).
 * Kimlik ve kapsam oturumdan/sunucudan gelir; bu şemalardaki kimlikler yalnız HEDEFİ gösterir ve yetki vermez.
 * Çıktılarda telefon ve e-posta YALNIZ maskelidir (ham değer alanı yoktur).
 *
 * Sunucu kuralları (servis payı uygular, ekran ipucu olarak `manageable` alanını kullanır):
 *  1. Kapsam: yönetici, hedef kullanıcının BÜTÜN ETKİN üyeliklerinin bölümlerini kapsamalıdır. Askıya alma hesap
 *     geneli olduğundan kısmen kapsanan kullanıcıyı yalnız kapsamı genişleten (ör. sistem) yönetici askıya alır.
 *     Hiç üyeliği olmayan kullanıcıyı yalnız sistem yöneticisi yönetir.
 *  2. Kendi hesabı/yetkisi üzerinde işlem yapılamaz (`ADMIN_SELF_ACTION`).
 *  3. Etkin yönetici yetkisi olan kullanıcıyı yalnız sistem yöneticisi askıya alır/düzeltir
 *     (`ADMIN_TARGET_PRIVILEGED`): bölüm yöneticisi kendi üstündeki yöneticiyi askıya alamaz.
 *  4. Yetkiyi yeniden doğrulama, hedef değişimi ve işlem kaydı AYNI işlemde yapılır; kayıt yazılamazsa eylem geri alınır.
 */

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export const MEMBERSHIP_ROLES = ['STUDENT', 'ALUMNI', 'ACADEMIC'] as const;
export const VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;

const year = z
  .number({ error: INVALID })
  .int({ error: INVALID })
  .min(1950, { error: INVALID })
  .max(2100, { error: INVALID });

// ---------------------------------------------------------------------------------------------
// Kullanıcı arama ve ayrıntı
// ---------------------------------------------------------------------------------------------

/**
 * `query` ad ya da e-postada büyük/küçük harf duyarsız arar; sonuç yine yalnız yöneticinin kapsamındaki
 * kullanıcılardır. Süzgeçler yetki vermez.
 */
export const searchUsersSchema = z
  .object({
    ...adminPageInput,
    query: adminSearchText.optional(),
    departmentId: adminId.optional(),
    role: z.enum(MEMBERSHIP_ROLES, { error: INVALID }).optional(),
    verificationStatus: z.enum(VERIFICATION_STATUSES, { error: INVALID }).optional(),
    status: z.enum(USER_STATUSES, { error: INVALID }).optional(),
  })
  .strict();
export type SearchUsersInput = z.input<typeof searchUsersSchema>;

export const adminMembershipViewSchema = z
  .object({
    id: z.string(),
    departmentId: z.string(),
    departmentName: z.string(),
    role: z.enum(MEMBERSHIP_ROLES),
    verificationStatus: z.enum(VERIFICATION_STATUSES),
    /** Kapanmamış (etkin) üyelik. */
    active: z.boolean(),
    entryYear: z.number().int().nullable(),
    graduationYear: z.number().int().nullable(),
    /** Üyeliğin bölümü bu yöneticinin kapsamında mı? Kapsam dışı üyelik yalnız bilgi olarak görünür. */
    inScope: z.boolean(),
  })
  .strict();

export const adminUserSummarySchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    /** `ayse@ogr.iu.edu.tr` → `a***@o***.iu.edu.tr` (`rules/maskEmail`). */
    maskedEmail: maskedAdminEmailSchema,
    /** `*** *** ** 67` (`rules/maskPhone`); telefon yoksa `null`. */
    maskedPhone: maskedAdminPhoneSchema.nullable(),
    status: z.enum(USER_STATUSES),
    memberships: z.array(adminMembershipViewSchema),
    /** Etkin yönetici yetkisi var (askıya alma/düzeltme için sistem yöneticisi gerekir). */
    isAdmin: z.boolean(),
    mentorActive: z.boolean(),
    /** Bu yönetici bu kullanıcı üzerinde askıya alma/düzeltme yapabilir mi? (Sunucu yine denetler.) */
    manageable: z.boolean(),
  })
  .strict();
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUserPageSchema = z
  .object({ items: z.array(adminUserSummarySchema), nextCursor: z.string().nullable() })
  .strict();
export type AdminUserPage = z.infer<typeof adminUserPageSchema>;

export const getUserDetailSchema = z.object({ userId: adminId }).strict();
export type GetUserDetailInput = z.input<typeof getUserDetailSchema>;

export const adminUserDetailSchema = adminUserSummarySchema
  .extend({
    createdAt: z.date(),
    suspension: z
      .object({
        /** Süresi dolmuş askı `false` sayılır. */
        suspended: z.boolean(),
        reason: z.string().nullable(),
        expiresAt: z.date().nullable(),
      })
      .strict(),
  })
  .strict();
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

// ---------------------------------------------------------------------------------------------
// Askıya alma / kaldırma (D5: Better Auth admin eklentisinin ban alanları; oturumlar düşer)
// ---------------------------------------------------------------------------------------------

export const SUSPENSION_MAX_DAYS = 365;

/**
 * `expiresAt` verilmezse askı süresizdir. Süreli askı gelecekte olmalı ve en fazla `SUSPENSION_MAX_DAYS` gün
 * sonra bitmelidir. Askıya alınan kullanıcının bütün oturumları aynı işlemde silinir ve yeni oturum açamaz.
 * Gerekçe zorunludur (`USER_SUSPEND`).
 */
export const suspendUserSchema = z
  .object({
    userId: adminId,
    reason: adminReason,
    confirmed: adminConfirmation,
    expiresAt: z.coerce.date({ error: INVALID }).optional(),
  })
  .strict()
  .refine(
    (value) => {
      if (value.expiresAt === undefined) return true;
      const now = Date.now();
      return (
        value.expiresAt.getTime() > now &&
        value.expiresAt.getTime() <= now + SUSPENSION_MAX_DAYS * 86_400_000
      );
    },
    { error: INVALID, path: ['expiresAt'] },
  );
export type SuspendUserInput = z.input<typeof suspendUserSchema>;

export const suspendUserOutputSchema = z
  .object({
    userId: z.string(),
    status: z.literal('SUSPENDED'),
    expiresAt: z.date().nullable(),
    /** Silinen oturum sayısı. */
    sessionsRevoked: z.number().int().min(0),
  })
  .strict();
export type SuspendUserOutput = z.infer<typeof suspendUserOutputSchema>;

/** Askıyı kaldırmada da gerekçe ve açık onay zorunludur (P1-11 kartı). */
export const unsuspendUserSchema = z
  .object({ userId: adminId, reason: adminReason, confirmed: adminConfirmation })
  .strict();
export type UnsuspendUserInput = z.input<typeof unsuspendUserSchema>;

export const unsuspendUserOutputSchema = z
  .object({ userId: z.string(), status: z.literal('ACTIVE') })
  .strict();
export type UnsuspendUserOutput = z.infer<typeof unsuspendUserOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Üyelik (rol/bölüm) düzeltme (`ROLE_CORRECT`, gerekçe zorunlu)
// ---------------------------------------------------------------------------------------------

/**
 * Yanlış beyanı düzeltir. `departmentId` ya da `role` değişirse eski üyelik kapanır ve yöneticice doğrulanmış
 * (`ADMIN` yöntemi) yeni üyelik açılır; geçmiş korunur, içerik ve puan kullanıcıda kalır. Yalnız yıl alanları
 * değişirse satır yerinde güncellenir. Hem eski hem yeni bölüm yöneticinin kapsamında olmalıdır. Öğrenci → mezun
 * geçişi bu eylem DEĞİLDİR (mezun belgesi / rol geçişi). Mezun üyelik `graduationYear`, öğrenci üyelik `entryYear` ister.
 */
export const correctMembershipSchema = z
  .object({
    membershipId: adminId,
    reason: adminReason,
    confirmed: adminConfirmation,
    changes: z
      .object({
        departmentId: adminId.optional(),
        role: z.enum(MEMBERSHIP_ROLES, { error: INVALID }).optional(),
        entryYear: year.nullable().optional(),
        graduationYear: year.nullable().optional(),
      })
      .strict()
      .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
        error: INVALID,
      }),
  })
  .strict();
export type CorrectMembershipInput = z.input<typeof correctMembershipSchema>;

export const correctMembershipOutputSchema = z
  .object({
    /** Düzeltmeden sonra geçerli üyelik (bölüm/rol değiştiyse yeni satır). */
    membershipId: z.string(),
    /** Bölüm/rol değiştiyse kapatılan eski üyelik; yıl düzeltmesinde `null`. */
    previousMembershipId: z.string().nullable(),
  })
  .strict();
export type CorrectMembershipOutput = z.infer<typeof correctMembershipOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Yönetici atama / kaldırma (yalnız sistem yöneticisi; `ADMIN_GRANT`, `ADMIN_REVOKE`)
// ---------------------------------------------------------------------------------------------

export const listAdminGrantsSchema = z
  .object({ ...adminPageInput, active: z.boolean({ error: INVALID }).default(true) })
  .strict();
export type ListAdminGrantsInput = z.input<typeof listAdminGrantsSchema>;

export const adminGrantViewSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    userDisplayName: z.string(),
    maskedEmail: maskedAdminEmailSchema,
    scope: z.enum(ADMIN_LEVELS),
    facultyId: z.string().nullable(),
    facultyName: z.string().nullable(),
    departmentId: z.string().nullable(),
    departmentName: z.string().nullable(),
    grantedAt: z.date(),
    grantedByName: z.string(),
    revokedAt: z.date().nullable(),
  })
  .strict();
export const adminGrantPageSchema = z
  .object({ items: z.array(adminGrantViewSchema), nextCursor: z.string().nullable() })
  .strict();
export type AdminGrantPage = z.infer<typeof adminGrantPageSchema>;

/** Kapsam kimliği yalnız ilgili kapsamda verilir; hedef fakülte/bölüm var olmalıdır. Gerekçe isteğe bağlıdır. */
export const grantAdminSchema = z.discriminatedUnion(
  'scope',
  [
    z
      .object({
        scope: z.literal('SYSTEM'),
        userId: adminId,
        reason: adminReason.optional(),
        confirmed: adminConfirmation,
      })
      .strict(),
    z
      .object({
        scope: z.literal('FACULTY'),
        confirmed: adminConfirmation,
        userId: adminId,
        facultyId: adminId,
        reason: adminReason.optional(),
      })
      .strict(),
    z
      .object({
        scope: z.literal('DEPARTMENT'),
        confirmed: adminConfirmation,
        userId: adminId,
        departmentId: adminId,
        reason: adminReason.optional(),
      })
      .strict(),
  ],
  { error: INVALID },
);
export type GrantAdminInput = z.input<typeof grantAdminSchema>;

export const grantAdminOutputSchema = z.object({ grantId: z.string() }).strict();
export type GrantAdminOutput = z.infer<typeof grantAdminOutputSchema>;

/** Gerekçe zorunludur. Kendi yetkini ve son sistem yöneticisi yetkisini kaldıramazsın. */
export const revokeAdminSchema = z
  .object({ grantId: adminId, reason: adminReason, confirmed: adminConfirmation })
  .strict();
export type RevokeAdminInput = z.input<typeof revokeAdminSchema>;

export const revokeAdminOutputSchema = z
  .object({ grantId: z.string(), revokedAt: z.date() })
  .strict();
export type RevokeAdminOutput = z.infer<typeof revokeAdminOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları
// ---------------------------------------------------------------------------------------------

const authErrors = ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED', 'AUTH_NOT_VERIFIED'] as const;
const staffErrors = [...authErrors, 'AUTH_FORBIDDEN'] as const;
const reasonErrors = ['AUDIT_REASON_REQUIRED', 'AUDIT_REASON_INVALID'] as const;

export const ADMIN_USER_ACTION_ERRORS = {
  searchUsers: [...staffErrors, 'VALIDATION_INVALID'],
  getUserDetail: [...staffErrors, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
  suspendUser: [
    ...staffErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'ADMIN_SELF_ACTION',
    'ADMIN_TARGET_PRIVILEGED',
    'USER_ALREADY_SUSPENDED',
    ...reasonErrors,
  ],
  unsuspendUser: [
    ...staffErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'ADMIN_SELF_ACTION',
    'ADMIN_TARGET_PRIVILEGED',
    'USER_NOT_SUSPENDED',
    ...reasonErrors,
  ],
  correctMembership: [
    ...staffErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'ADMIN_SELF_ACTION',
    'ADMIN_TARGET_PRIVILEGED',
    'MEMBERSHIP_CORRECTION_INVALID',
    ...reasonErrors,
  ],
  listAdminGrants: [...staffErrors, 'VALIDATION_INVALID'],
  grantAdmin: [
    ...staffErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'ADMIN_GRANT_EXISTS',
    ...reasonErrors,
  ],
  revokeAdmin: [
    ...staffErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'ADMIN_SELF_ACTION',
    'ADMIN_GRANT_NOT_ACTIVE',
    'ADMIN_LAST_SYSTEM_GRANT',
    ...reasonErrors,
  ],
} as const satisfies Record<string, readonly ErrorCode[]>;

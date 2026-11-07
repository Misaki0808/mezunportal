import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

/**
 * Kimlik doğrulama sözleşmesi (P1-02; D1, D2, D5). Servis (W1) ve ekran (W2) bunu paylaşır; ikisi de
 * sözleşmeyi DEĞİŞTİRMEZ (değişiklik `ORTAK DOSYA İSTEĞİ`). Zod hata mesajları bir `ErrorCode`'dur.
 *
 * İLKE — kayıtlı/kayıtsız e-postaya AYNI yanıt: giriş bağlantısı ve e-posta değiştirme isteği e-postanın
 * kayıtlı, askıda, silinmiş ya da alan adının izinli olup olmadığını hiçbir yanıtta, hata kodunda ya da
 * yanıt süresinde belli etmez. Tek olası yanıt `CHECK_EMAIL`; olası hatalar yalnız geçersiz biçim ve hız
 * sınırıdır (ikisi de kayıt durumundan bağımsızdır).
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

/** Yalnız yazdırılabilir ASCII: görsel benzer (homograf) alan adlarını ve görünmez karakterleri dışarıda bırakır. */
const isPrintableAscii = (value: string) => /^[\x21-\x7e]+$/.test(value);

/** Kırpılır, küçük harfe çevrilir (e-posta büyük/küçük harfe duyarsızdır; ASCII olduğu için Türkçe harf sorunu yok). */
export const emailSchema = z
  .string({ error: INVALID })
  .trim()
  .min(3, { error: INVALID })
  .max(254, { error: INVALID })
  .refine(isPrintableAscii, { error: INVALID })
  .pipe(z.email({ error: INVALID }))
  .transform((value) => value.toLowerCase());

export const departmentIdSchema = z
  .string({ error: INVALID })
  .trim()
  .min(1, { error: INVALID })
  .max(64, { error: INVALID });

/** Ekran yolları: sunucu (Better Auth geri çağrıları) ve ekran aynı yolları kullanır. */
export const AUTH_PATHS = {
  /** Giriş ekranı. Bağlantı hatasında `?hata=<ErrorCode>` ile döner. */
  signIn: '/giris',
  /** Girişten sonra varsayılan hedef. */
  afterSignIn: '/',
} as const;

export const SIGN_IN_ERROR_QUERY_PARAM = 'hata';

/** Giriş geri çağrısında (`/giris?hata=`) görünebilecek kodlar. */
export const SIGN_IN_CALLBACK_ERROR_CODES = [
  'AUTH_LINK_INVALID',
  'AUTH_ACCOUNT_SUSPENDED',
  'RATE_LIMITED',
] as const satisfies readonly ErrorCode[];

// ---------------------------------------------------------------------------------------------
// Giriş seçenekleri
// ---------------------------------------------------------------------------------------------

/** LinkedIn anahtarları yoksa sağlayıcı kapalıdır ve ekran düğmeyi göstermez. E-posta bağlantısı hep açıktır. */
export const signInOptionsSchema = z.object({ linkedin: z.boolean() });
export type SignInOptions = z.infer<typeof signInOptionsSchema>;

// ---------------------------------------------------------------------------------------------
// E-posta bağlantısıyla giriş ve e-posta değiştirme (aynı nötr yanıt)
// ---------------------------------------------------------------------------------------------

export const requestSignInLinkSchema = z.object({ email: emailSchema });
export type RequestSignInLinkInput = z.input<typeof requestSignInLinkSchema>;

/** Her durumda dönen tek yanıt: “e-postanı kontrol et”. */
export const checkEmailResponseSchema = z.object({ status: z.literal('CHECK_EMAIL') });
export type CheckEmailResponse = z.infer<typeof checkEmailResponseSchema>;
export const CHECK_EMAIL_RESPONSE: CheckEmailResponse = { status: 'CHECK_EMAIL' };

export const requestEmailChangeSchema = z.object({ newEmail: emailSchema });
export type RequestEmailChangeInput = z.input<typeof requestEmailChangeSchema>;

// ---------------------------------------------------------------------------------------------
// Üyelik beyanı (D2): alan adı üniversiteyi doğrular, bölümü doğrulamaz; bölüm beyandır.
//  - ÖĞRENCİ: okul e-posta alan adı (University.studentEmailDomains) + bölüm ve giriş yılı beyanı.
//  - AKADEMİSYEN: kurumsal alan adı (University.staffEmailDomains) + bölüm beyanı.
//  - MEZUN: alan adıyla doğrulanamaz → mezun belgesi (graduation-document.ts).
// Alan adı kuralı sabit değer değil `University` kaydından okunur (K-06).
// ---------------------------------------------------------------------------------------------

export const ENTRY_YEAR_MIN = 1990;

export const declareMembershipSchema = z.discriminatedUnion(
  'role',
  [
    z.object({
      role: z.literal('STUDENT'),
      departmentId: departmentIdSchema,
      entryYear: z
        .number({ error: INVALID })
        .int({ error: INVALID })
        .min(ENTRY_YEAR_MIN, { error: INVALID })
        // Giriş yılı bugünden ileri olamaz (parse anında hesaplanır).
        .refine((year) => year <= new Date().getFullYear(), { error: INVALID }),
    }),
    z.object({ role: z.literal('ACADEMIC'), departmentId: departmentIdSchema }),
  ],
  { error: INVALID },
);
export type DeclareMembershipInput = z.input<typeof declareMembershipSchema>;

export const declareMembershipOutputSchema = z.object({
  membershipId: z.string(),
  status: z.literal('VERIFIED'),
});
export type DeclareMembershipOutput = z.infer<typeof declareMembershipOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Doğrulama durumu (ekranın “şimdi ne yapmalıyım?” sorusunun cevabı)
// ---------------------------------------------------------------------------------------------

/** E-postanın alan adı sınıfı: ekran hangi doğrulama yolunu göstereceğini buradan seçer. */
export const emailKindSchema = z.enum(['STUDENT_DOMAIN', 'STAFF_DOMAIN', 'OTHER']);

/**
 *  - `VERIFIED`: en az bir doğrulanmış etkin üyelik var.
 *  - `NOT_STARTED`: doğrulama başlamadı (alan adı öğrenci/personel ise beyan, değilse belge yükleme).
 *  - `AWAITING_REVIEW`: mezun belgesi yöneticide bekliyor.
 *  - `REJECTED`: son belge reddedildi (`rejection.reason` gösterilir, yeniden yüklenebilir).
 */
export const verificationOverallSchema = z.enum([
  'VERIFIED',
  'NOT_STARTED',
  'AWAITING_REVIEW',
  'REJECTED',
]);

export const membershipSummarySchema = z.object({
  id: z.string(),
  departmentId: z.string(),
  departmentName: z.string(),
  role: z.enum(['STUDENT', 'ALUMNI', 'ACADEMIC']),
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
});

export const verificationStateSchema = z.object({
  status: verificationOverallSchema,
  emailKind: emailKindSchema,
  memberships: z.array(membershipSummarySchema),
  pendingDocument: z
    .object({
      id: z.string(),
      departmentId: z.string(),
      departmentName: z.string(),
      graduationYear: z.number().int(),
      submittedAt: z.date(),
    })
    .nullable(),
  rejection: z
    .object({
      departmentId: z.string(),
      reason: z.string(),
      decidedAt: z.date(),
    })
    .nullable(),
});
export type VerificationState = z.infer<typeof verificationStateSchema>;

// ---------------------------------------------------------------------------------------------
// Test girişi (yalnız APP_ENV local/test; prod'da yapılandırmada YOKTUR ve bunun testi vardır)
// ---------------------------------------------------------------------------------------------

/** `prisma/seed-data.ts` `TEST_PERSONAS` anahtarlarıyla aynı (test eşitliği korur). */
export const TEST_LOGIN_PERSONAS = [
  'student',
  'seniorMentor',
  'alumniMentor',
  'academic',
  'departmentAdmin',
  'systemAdmin',
] as const;

export const testLoginSchema = z.object({
  persona: z.enum(TEST_LOGIN_PERSONAS, { error: INVALID }),
});
export type TestLoginInput = z.input<typeof testLoginSchema>;
export const testLoginOutputSchema = z.object({ signedIn: z.literal(true) });
export type TestLoginOutput = z.infer<typeof testLoginOutputSchema>;

export const signOutOutputSchema = z.object({ signedOut: z.literal(true) });
export type SignOutOutput = z.infer<typeof signOutOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları (ekran hangi kodları metne çevireceğini buradan bilir)
// ---------------------------------------------------------------------------------------------

export const AUTH_ACTION_ERRORS = {
  getSignInOptions: [],
  requestSignInLink: ['VALIDATION_INVALID', 'RATE_LIMITED'],
  requestEmailChange: [
    'VALIDATION_INVALID',
    'RATE_LIMITED',
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
  ],
  declareMembership: [
    'VALIDATION_INVALID',
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
    'EMAIL_DOMAIN_NOT_ALLOWED',
    'RESOURCE_NOT_FOUND',
    'MEMBERSHIP_ALREADY_VERIFIED',
  ],
  getVerificationState: ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED'],
  signOut: [],
  signInAsTestPersona: ['VALIDATION_INVALID', 'AUTH_TEST_LOGIN_DISABLED', 'RESOURCE_NOT_FOUND'],
} as const satisfies Record<string, readonly ErrorCode[]>;

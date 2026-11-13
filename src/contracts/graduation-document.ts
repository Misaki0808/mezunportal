import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { departmentIdSchema } from './auth';

/**
 * Mezun belgesi sözleşmesi (P1-02; D2). Mezun, kişisel e-postayla girer ve e-Devlet barkodlu mezun
 * belgesini (PDF) yükler; bölüm yöneticisi barkodu e-Devlet belge doğrulama ekranında ELLE kontrol eder
 * ve onaylar ya da gerekçeyle reddeder. Belge dosyası KARAR ANINDA silinir (`storageKey` null olur).
 *
 * Sunucu bu sözleşmedeki kontrolleri YENİDEN yapar ve ek olarak dosyanın İÇERİĞİNE bakar (sihirli bayt,
 * `hasPdfMagic`): istemcinin söylediği tür ve uzantı güvenilmez.
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_MIME_TYPE = 'application/pdf';
export const GRADUATION_YEAR_MIN = 1950;

/** PDF dosyaları `%PDF-` ile başlar. Uzantıya/MIME'a değil bu içeriğe bakılır. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

export function hasPdfMagic(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((byte, index) => bytes[index] === byte);
}

/**
 * Yükleme `FormData` ile yapılır (`uploadGraduationDocument(formData)`). Alanlar: `departmentId`,
 * `graduationYear`, `file`. Hata kodları dosya alanının altında gösterilir (`fieldErrors.file`).
 */
export const graduationDocumentFormSchema = z.object({
  departmentId: departmentIdSchema,
  graduationYear: z.coerce
    .number({ error: INVALID })
    .int({ error: INVALID })
    .min(GRADUATION_YEAR_MIN, { error: INVALID })
    // Beyan edilen mezuniyet yılı en fazla gelecek yıl olabilir (yaz dönemi başvurusu).
    .refine((year) => year <= new Date().getFullYear() + 1, { error: INVALID }),
  file: z
    .file({ error: 'DOCUMENT_REQUIRED' })
    .min(1, { error: 'DOCUMENT_EMPTY' })
    .max(MAX_DOCUMENT_BYTES, { error: 'DOCUMENT_TOO_LARGE' })
    .mime(DOCUMENT_MIME_TYPE, { error: 'DOCUMENT_NOT_PDF' }),
});
export type GraduationDocumentForm = z.output<typeof graduationDocumentFormSchema>;

/** `FormData`'dan YALNIZ bilinen alanları alır (fazladan alanlar sessizce atılır). */
export function graduationDocumentFormInput(formData: FormData): Record<string, unknown> {
  const file = formData.get('file');
  return {
    departmentId: formData.get('departmentId'),
    graduationYear: formData.get('graduationYear'),
    // Tarayıcı dosya SEÇİLMEDİĞİNDE adsız, 0 baytlık boş bir `File` gönderir: bu "seçilmedi"dir (DOCUMENT_REQUIRED). Seçilmiş
    // ama boş bir dosyanın adı vardır ve DOCUMENT_EMPTY olarak kalır.
    file:
      typeof File !== 'undefined' && file instanceof File && file.name === '' && file.size === 0
        ? null
        : file,
  };
}

export const uploadGraduationDocumentOutputSchema = z.object({
  documentId: z.string(),
  status: z.literal('PENDING'),
});
export type UploadGraduationDocumentOutput = z.infer<typeof uploadGraduationDocumentOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Yönetici kuyruğu ve karar
// ---------------------------------------------------------------------------------------------

export const REVIEW_REASON_MIN = 3;
export const REVIEW_REASON_MAX = 1000;
export const QUEUE_PAGE_SIZE_DEFAULT = 20;
export const QUEUE_PAGE_SIZE_MAX = 50;

export const listPendingGraduationDocumentsSchema = z.object({
  /** Verilirse yalnız bu bölüm (yöneticinin kapsamı içinde olmalı); verilmezse kapsamdaki tüm bölümler. */
  departmentId: departmentIdSchema.optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(QUEUE_PAGE_SIZE_MAX).default(QUEUE_PAGE_SIZE_DEFAULT),
});
export type ListPendingGraduationDocumentsInput = z.input<
  typeof listPendingGraduationDocumentsSchema
>;

/**
 * Kuyruk satırı: başvuranın e-postası MASKELİ gelir (`a***@o***.edu.tr`); yönetici görev ekranında bile
 * ham e-posta görmez. Belge dosyası yalnız yetki kontrollü rotadan akıtılır (`graduationDocumentFileHref`).
 */
export const pendingGraduationDocumentSchema = z.object({
  id: z.string(),
  departmentId: z.string(),
  departmentName: z.string(),
  graduationYear: z.number().int(),
  submittedAt: z.date(),
  applicantName: z.string(),
  maskedEmail: z.string(),
});
export type PendingGraduationDocument = z.infer<typeof pendingGraduationDocumentSchema>;

export const pendingGraduationDocumentPageSchema = z.object({
  items: z.array(pendingGraduationDocumentSchema),
  nextCursor: z.string().nullable(),
});
export type PendingGraduationDocumentPage = z.infer<typeof pendingGraduationDocumentPageSchema>;

/** Belge dosyasını akıtan rota (yetki: kapsayan yönetici; başvuran kendi belgesini görmez). Servis kartı yazar. */
export function graduationDocumentFileHref(documentId: string): string {
  return `/api/graduation-documents/${encodeURIComponent(documentId)}/file`;
}

const reviewReasonSchema = z
  .string({ error: 'AUDIT_REASON_REQUIRED' })
  .trim()
  .min(1, { error: 'AUDIT_REASON_REQUIRED' })
  .pipe(
    z
      .string()
      .min(REVIEW_REASON_MIN, { error: 'AUDIT_REASON_INVALID' })
      .max(REVIEW_REASON_MAX, { error: 'AUDIT_REASON_INVALID' }),
  );

/** Onayda gerekçe gerekmez; REDDEDERKEN gerekçe ZORUNLUDUR (işlem kaydına ve başvurana gider). */
export const reviewGraduationDocumentSchema = z.discriminatedUnion(
  'decision',
  [
    z.object({ decision: z.literal('APPROVE'), documentId: z.string().min(1).max(64) }),
    z.object({
      decision: z.literal('REJECT'),
      documentId: z.string().min(1).max(64),
      reason: reviewReasonSchema,
    }),
  ],
  { error: INVALID },
);
export type ReviewGraduationDocumentInput = z.input<typeof reviewGraduationDocumentSchema>;

export const reviewGraduationDocumentOutputSchema = z.object({
  documentId: z.string(),
  decision: z.enum(['APPROVE', 'REJECT']),
});
export type ReviewGraduationDocumentOutput = z.infer<typeof reviewGraduationDocumentOutputSchema>;

export const GRADUATION_DOCUMENT_ACTION_ERRORS = {
  uploadGraduationDocument: [
    'VALIDATION_INVALID',
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
    'DOCUMENT_REQUIRED',
    'DOCUMENT_EMPTY',
    'DOCUMENT_TOO_LARGE',
    'DOCUMENT_NOT_PDF',
    'DOCUMENT_ALREADY_PENDING',
    'MEMBERSHIP_ALREADY_VERIFIED',
    'RESOURCE_NOT_FOUND',
    'RATE_LIMITED',
  ],
  listPendingGraduationDocuments: [
    'VALIDATION_INVALID',
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
    'AUTH_NOT_VERIFIED',
    'AUTH_FORBIDDEN',
    'CONSENT_REQUIRED',
  ],
  reviewGraduationDocument: [
    'VALIDATION_INVALID',
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
    'AUTH_NOT_VERIFIED',
    'AUTH_FORBIDDEN',
    'AUDIT_REASON_REQUIRED',
    'AUDIT_REASON_INVALID',
    'DOCUMENT_NOT_PENDING',
    'MEMBERSHIP_TRANSITION_INVALID',
    'RESOURCE_NOT_FOUND',
    'CONSENT_REQUIRED',
  ],
} as const satisfies Record<string, readonly ErrorCode[]>;

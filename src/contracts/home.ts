import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

/**
 * Ana sayfa panosu sözleşmesi (tur 2 bulgu #2). Yalnız KENDİ verisinin sayıları: yanıt bekleyen iletişim talebi, CV
 * incelemesi, doldurulacak görüşme formu ve (yöneticiyse) kapsamındaki bekleyen moderasyon işi. Başka kullanıcının verisi
 * ya da kimliği yoktur; sayılar sunucuda oturumdaki kullanıcıdan hesaplanır, istemciden kapsam alınmaz.
 */
export const HOME_ROLES = ['STUDENT', 'MENTOR'] as const;
export type HomeRole = (typeof HOME_ROLES)[number];

export const homeSummarySchema = z
  .object({
    /** Karşılama için ilk ad (kullanıcının kendi adı). */
    firstName: z.string(),
    /** Doğrulanmış etkin üyeliklerde öğrenci varsa `STUDENT`; yalnız mezun/akademisyen ise `MENTOR`. */
    role: z.enum(HOME_ROLES),
    pending: z
      .object({
        /** Bana gelen, yanıt bekleyen iletişim talepleri. */
        contactRequests: z.number().int().min(0),
        /** Mentor olarak yanıt bekleyen (süresi dolmamış) CV inceleme talepleri. */
        cvReviewsToAnswer: z.number().int().min(0),
        /** Öğrenci olarak yorumu yanıtlanmış, "faydalı" işaretlenmemiş CV incelemeleri. */
        cvReviewsToRate: z.number().int().min(0),
        /** Doldurulmayı bekleyen görüşme formları. Randevu talepleri (#43) gelince burada ayrıca sayılır. */
        feedbackForms: z.number().int().min(0),
      })
      .strict(),
    /** Yönetici değilse `null`; yöneticide kapsamındaki bekleyen deneyim + şikâyet + belge sayısı. */
    adminPending: z.number().int().min(0).nullable(),
  })
  .strict();
export type HomeSummary = z.infer<typeof homeSummarySchema>;

export const HOME_ACTION_ERRORS = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'CONSENT_REQUIRED',
] as const satisfies readonly ErrorCode[];

import { describe, expect, it } from 'vitest';
import { adminId } from './admin';
import { alumniSearchSchema } from './alumni-directory';
import { storiesScopeSchema } from './alumni-story';
import { applicationScopeSchema } from './application-window';
import { appointmentIdSchema } from './appointment';
import { campusEventIdSchema } from './campus-events';
import { companySlugSchema } from './companies';
import { listContactRequestsSchema } from './contact-request';
import { cvIdSchema } from './cv';
import { cvReviewRequestIdSchema } from './cv-review-request';
import { experienceIdSchema } from './experience';
import { markInboxReadInputSchema } from './inbox';
import { interviewQuerySchema } from './interview-questions';
import { jobPostingIdSchema } from './job-postings';
import { stillThereInputSchema } from './notifications';

/**
 * Kimlikteki NUL (`%00`) PostgreSQL'e gidince "geçersiz bayt dizisi" hatası verip beklenmeyen hataya (500) dönüşüyordu
 * (liste turu 2, BULGU-3). Ortak kimlik şeması denetim karakterini şema katmanında reddeder; bu test, kimlik taşıyan
 * başlıca sözleşmelerin hepsinin bu şemayı kullandığını bekçiler (biri yeniden çıplak `z.string()`'e dönerse kırılır).
 */
const NUL = '\u0000';
const CASES: [string, { safeParse: (value: unknown) => { success: boolean } }, unknown][] = [
  ['adminId', adminId, NUL],
  ['hikâye kapsamı', storiesScopeSchema, { departmentId: NUL }],
  ['takvim kapsamı (şirket)', applicationScopeSchema, { kind: 'COMPANY', id: NUL }],
  ['takvim kapsamı (sektör)', applicationScopeSchema, { kind: 'SECTOR', id: NUL }],
  ['mülakat sorusu şirket süzgeci', interviewQuerySchema, { companyId: NUL }],
  ['mülakat sorusu sektör süzgeci', interviewQuerySchema, { sectorId: NUL }],
  ['mezun arama sektör süzgeci', alumniSearchSchema, { sectorId: NUL }],
  ['şirket slug', companySlugSchema, { slug: `a${NUL}b` }],
  ['iletişim isteği imleci', listContactRequestsSchema, { box: 'INCOMING', cursor: NUL }],
  ['deneyim kimliği', experienceIdSchema, { experienceId: NUL }],
  ['randevu kimliği', appointmentIdSchema, { appointmentId: NUL }],
  ['CV kimliği', cvIdSchema, { cvUploadId: NUL }],
  ['CV inceleme talebi kimliği', cvReviewRequestIdSchema, { requestId: NUL }],
  ['ilan kimliği', jobPostingIdSchema, { postingId: NUL }],
  ['etkinlik kimliği', campusEventIdSchema, { eventId: NUL }],
  ['bildirim kimlikleri', markInboxReadInputSchema, { ids: [NUL] }],
  ['hâlâ orada mısın jetonu', stillThereInputSchema, { token: NUL, choice: 'YES' }],
];

describe('kimlik şemaları denetim karakterini reddeder', () => {
  it.each(CASES)('%s', (_name, schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it('aynı şemalar temiz kimliği hâlâ kabul eder', () => {
    expect(storiesScopeSchema.safeParse({ departmentId: 'd1' }).success).toBe(true);
    expect(applicationScopeSchema.safeParse({ kind: 'COMPANY', id: 'c1' }).success).toBe(true);
    expect(interviewQuerySchema.parse({}).companyId).toBe('');
    expect(interviewQuerySchema.parse({ companyId: ' c1 ' }).companyId).toBe('c1');
  });
});

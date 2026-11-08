import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ApplicationChannel,
  ExperiencePay,
  ExperienceStatus,
  ExperienceType,
  ReportStatus,
  ReportTargetType,
  TermSeason,
} from '@/generated/prisma/enums';
import {
  APPLICATION_CHANNELS,
  EXPERIENCE_PAY,
  EXPERIENCE_STATUSES,
  EXPERIENCE_TYPES,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  TERM_SEASONS,
  anonymousExperienceSchema,
  experienceDetailSchema,
  experienceDraftTemplateSchema,
  experiencePageSchema,
  experienceReportPageSchema,
  experienceTemplateSchema,
  listModerationQueueSchema,
  listMyExperiencesSchema,
  reportExperienceSchema,
  reviewExperienceSchema,
  saveExperienceDraftSchema,
  submitExperienceOutputSchema,
  reviewExperienceOutputSchema,
  type ExperienceDetail,
} from './experience';

const common = {
  organizationName: 'Örnek Kurum',
  termYear: 2026,
  termSeason: 'SUMMER',
  whatLearned: 'Takım çalışması',
  advice: 'Erken başvur',
};
const application = {
  applicationChannel: 'UNIVERSITY_ANNOUNCEMENT',
  processSteps: [{ title: 'Başvuru', description: 'Form doldurdum' }],
};
const ready = {
  INTERNSHIP: {
    ...common,
    ...application,
    type: 'INTERNSHIP',
    durationWeeks: 8,
    pay: 'PAID',
    interviewQuestions: ['Neden bu alan?'],
  },
  ERASMUS: { ...common, ...application, type: 'ERASMUS', country: 'Almanya', durationWeeks: 24 },
  COMPETITION: { ...common, ...application, type: 'COMPETITION' },
  HACKATHON: { ...common, ...application, type: 'HACKATHON' },
  CLUB: { ...common, type: 'CLUB', processSteps: [] },
  CERTIFICATE: { ...common, type: 'CERTIFICATE' },
  GRADUATE_STUDY: { ...common, ...application, type: 'GRADUATE_STUDY', interviewQuestions: [] },
  STUDY_ABROAD: {
    ...common,
    ...application,
    type: 'STUDY_ABROAD',
    country: 'İtalya',
    durationWeeks: 36,
  },
};
const now = new Date('2026-11-08T00:00:00Z');
const anonymous = {
  id: 'experience',
  departmentIdAtWrite: 'dept',
  content: ready.CERTIFICATE,
  status: 'PUBLISHED',
  isAnonymous: true,
  moderationNote: null,
  publishedAt: now,
  createdAt: now,
  updatedAt: now,
};

describe('P1-07 sözleşmesi', () => {
  it('enumlar Prisma ile birebir eşleşir', () => {
    for (const [values, prisma] of [
      [EXPERIENCE_TYPES, ExperienceType],
      [EXPERIENCE_STATUSES, ExperienceStatus],
      [TERM_SEASONS, TermSeason],
      [EXPERIENCE_PAY, ExperiencePay],
      [APPLICATION_CHANNELS, ApplicationChannel],
      [REPORT_TARGET_TYPES, ReportTargetType],
      [REPORT_STATUSES, ReportStatus],
    ] as const) {
      expect([...values].sort()).toEqual(Object.values(prisma).sort());
    }
  });
  it.each(EXPERIENCE_TYPES)(
    '%s: eksik taslak kaydedilebilir; tam şablon zorunlu alanları ister',
    (type) => {
      expect(experienceDraftTemplateSchema.safeParse({ type }).success).toBe(true);
      expect(experienceTemplateSchema.safeParse({ type }).success).toBe(false);
      expect(experienceTemplateSchema.safeParse(ready[type]).success).toBe(true);
    },
  );
  it('tür değişince alanlar değişir: sertifika ücret/mülakat, staj yabancı tür alanı kabul etmez', () => {
    for (const schema of [experienceTemplateSchema, experienceDraftTemplateSchema]) {
      expect(schema.safeParse({ ...ready.CERTIFICATE, pay: 'PAID' }).success).toBe(false);
      expect(schema.safeParse({ ...ready.CERTIFICATE, interviewQuestions: ['x'] }).success).toBe(
        false,
      );
      expect(schema.safeParse({ ...ready.CLUB, country: 'Almanya' }).success).toBe(false);
      expect(schema.safeParse({ ...ready.INTERNSHIP, universityName: 'uydurma' }).success).toBe(
        false,
      );
    }
    expect(
      experienceTemplateSchema.safeParse({ ...ready.ERASMUS, country: undefined }).success,
    ).toBe(false);
  });
  it('yıl, süre, metin ve iç içe adım/dizi sınırları kapanır', () => {
    for (const patch of [
      { termYear: 1899 },
      { termYear: 2101 },
      { termYear: 2026.5 },
      { termYear: '2026' },
      { durationWeeks: 0 },
      { durationWeeks: 521 },
      { whatLearned: ' ' },
      { advice: 'x'.repeat(10_001) },
      { organizationName: 'x'.repeat(201) },
      { pay: 'MAYBE' },
      { processSteps: [{ title: 'Adım', description: ' ' }] },
      { processSteps: [{ title: 'Adım', description: 'Açıklama', userId: 'sızma' }] },
      { processSteps: Array.from({ length: 21 }, () => ({ title: 'x', description: 'x' })) },
      { interviewQuestions: [null] },
      { interviewQuestions: [['x']] },
      { interviewQuestions: ['x'.repeat(1001)] },
    ])
      expect(experienceTemplateSchema.safeParse({ ...ready.INTERNSHIP, ...patch }).success).toBe(
        false,
      );
    expect(
      experienceTemplateSchema.safeParse({ ...ready.INTERNSHIP, durationWeeks: 1, termYear: 1900 })
        .success,
    ).toBe(true);
    expect(
      experienceTemplateSchema.safeParse({
        ...ready.INTERNSHIP,
        durationWeeks: 520,
        termYear: 2100,
      }).success,
    ).toBe(true);
  });
  it('anonim çıktı tipinde yazar alanı yoktur; kimlik sızıntısı bütün ortak çıktı yollarında reddedilir', () => {
    type Anonymous = Extract<ExperienceDetail, { isAnonymous: true }>;
    expectTypeOf<Anonymous>().not.toHaveProperty('author');
    expectTypeOf<Anonymous>().not.toHaveProperty('authorId');
    expectTypeOf<Anonymous>().not.toHaveProperty('userId');
    expect(experienceDetailSchema.safeParse(anonymous).success).toBe(true);
    expect(Object.keys(anonymousExperienceSchema.shape)).not.toContain('authorId');
    for (const patch of [
      { authorId: 'secret-id' },
      { author: { id: 'secret-id', displayName: 'Gizli' } },
      { userId: 'secret-id' },
      { ownerId: 'secret-id' },
      { email: 'secret@example.local' },
      { prefillPositionId: 'position-owner-link' },
    ]) {
      const leaking = { ...anonymous, ...patch };
      expect(experienceDetailSchema.safeParse(leaking).success).toBe(false);
      // Deneyimlerim ve moderasyon kuyruğu da bu tek sayfa sözleşmesini paylaşır.
      expect(experiencePageSchema.safeParse({ items: [leaking], nextCursor: null }).success).toBe(
        false,
      );
    }
    expect(
      experienceDetailSchema.safeParse({
        ...anonymous,
        isAnonymous: false,
        author: { id: 'public-id', displayName: 'Görünen Ad' },
      }).success,
    ).toBe(true);
  });
  it('taslak/kamuya açık çıktı ayrımı: yayınlanmış eksik içerik, sahte yayın tarihi ve ret notu geçmez', () => {
    expect(
      experienceDetailSchema.safeParse({ ...anonymous, content: { type: 'CERTIFICATE' } }).success,
    ).toBe(false);
    expect(experienceDetailSchema.safeParse({ ...anonymous, status: 'DRAFT' }).success).toBe(false);
    expect(
      experienceDetailSchema.safeParse({ ...anonymous, status: 'REJECTED', publishedAt: null })
        .success,
    ).toBe(false);
  });
  it('istemci yazar, durum, moderatör veya geçmiş bölüm kimliği yazamaz; CV daveti yalnız isteğe bağlı kaynak', () => {
    const draft = { departmentId: 'd', content: { type: 'INTERNSHIP' }, isAnonymous: true };
    expect(saveExperienceDraftSchema.safeParse(draft).success).toBe(true);
    expect(
      saveExperienceDraftSchema.safeParse({ ...draft, prefillPositionId: 'own-position' }).success,
    ).toBe(true);
    for (const patch of [
      { authorId: 'other' },
      { status: 'PUBLISHED' },
      { moderatedById: 'admin' },
      { departmentIdAtWrite: 'other' },
    ]) {
      expect(saveExperienceDraftSchema.safeParse({ ...draft, ...patch }).success).toBe(false);
    }
  });
  it('ret gerekçesi zorunlu ve sınırlı; yayın kararı durum alanı kabul etmez', () => {
    expect(
      submitExperienceOutputSchema.safeParse({ experienceId: 'x', status: 'PUBLISHED' }).success,
    ).toBe(false);
    expect(
      reviewExperienceOutputSchema.safeParse({ experienceId: 'x', status: 'PENDING' }).success,
    ).toBe(false);
    expect(
      reviewExperienceSchema.safeParse({ experienceId: 'x', decision: 'PUBLISH' }).success,
    ).toBe(true);
    for (const reason of [undefined, '', ' ', 'ab', 'x'.repeat(1001)]) {
      expect(
        reviewExperienceSchema.safeParse({ experienceId: 'x', decision: 'REJECT', reason }).success,
      ).toBe(false);
    }
    expect(
      reviewExperienceSchema.safeParse({
        experienceId: 'x',
        decision: 'REJECT',
        reason: 'Eksik bilgi',
      }).success,
    ).toBe(true);
    expect(
      reviewExperienceSchema.safeParse({
        experienceId: 'x',
        decision: 'PUBLISH',
        status: 'PUBLISHED',
      }).success,
    ).toBe(false);
  });
  it('şikâyet gerekçesi ve sayfalama sınırları; raportör kimliği çıktıda yok', () => {
    expect(reportExperienceSchema.safeParse({ experienceId: 'x', reason: '  ' }).success).toBe(
      false,
    );
    expect(
      reportExperienceSchema.safeParse({
        experienceId: 'x',
        reason: 'Yanıltıcı bilgi',
        reporterId: 'x',
      }).success,
    ).toBe(false);
    expect(listMyExperiencesSchema.parse({})).toEqual({ limit: 20 });
    expect(listModerationQueueSchema.safeParse({ limit: 51 }).success).toBe(false);
    const report = {
      id: 'r',
      targetType: 'EXPERIENCE',
      targetId: 'x',
      reason: 'Gerekçe',
      status: 'OPEN',
      reviewedAt: null,
      resolutionNote: null,
      createdAt: now,
      reporterId: 'gizli',
    };
    expect(
      experienceReportPageSchema.safeParse({ items: [report], nextCursor: null }).success,
    ).toBe(false);
  });
});

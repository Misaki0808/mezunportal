import { describe, expect, it } from 'vitest';

import { isErrorCode } from '@/lib/errors';

import {
  JOB_POSTING_ACTION_ACCESS,
  JOB_POSTING_ACTION_ERRORS,
  JOB_POSTING_MAX_DAYS,
  closeJobPostingOutputSchema,
  getJobPostingSchema,
  jobPostingCardSchema,
  jobPostingContentSchema,
  jobPostingDetailSchema,
  jobPostingDraftContentSchema,
  jobPostingFilterOptionsSchema,
  getJobPostingFilterOptionsSchema,
  jobPostingFormContextSchema,
  jobPostingModerationItemSchema,
  jobPostingReportSchema,
  listJobPostingReportsSchema,
  myJobPostingViewSchema,
  parseApplyUrl,
  reportJobPostingSchema,
  resolveJobPostingReportSchema,
  reviewJobPostingSchema,
  saveJobPostingDraftSchema,
  searchJobPostingsSchema,
  submitJobPostingOutputSchema,
} from './job-postings';

const complete = {
  kind: 'INTERNSHIP',
  title: 'Yönetim bilgi sistemleri stajyeri',
  organizationName: 'Örnek Teknoloji',
  isRemote: false,
  location: 'İstanbul',
  description: 'Veri analizi ve raporlama işlerinde destek verecek bir stajyer arıyoruz.',
  applyMethod: 'URL',
  applyUrl: 'https://kariyer.example.com/ilan/1',
  deadlineOn: '2030-07-01',
  targetDepartmentIds: ['d1'],
} as const;

describe('parseApplyUrl (açık yönlendirme/şema/iç adres yok)', () => {
  it.each([
    ['https://kariyer.example.com/ilan/1', 'https://kariyer.example.com/ilan/1'],
    ['  https://Kariyer.Example.com/a?b=1#c  ', 'https://kariyer.example.com/a?b=1#c'],
    ['https://example.com', 'https://example.com/'],
  ])('%s geçerli', (input, expected) => expect(parseApplyUrl(input)).toBe(expected));

  it.each([
    'http://example.com/ilan',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'ftp://example.com/x',
    '//example.com/x',
    '/ilan/1',
    'example.com/ilan',
    'https://user:pass@example.com/x',
    'https://localhost/x',
    'https://intranet/x',
    'https://printer.local/x',
    'https://192.168.1.10/x',
    'https://example.com/a b',
    'https://example.com/\u0000',
    `https://example.com/${'a'.repeat(500)}`,
    '',
    '   ',
  ])('%j reddedilir', (input) => expect(parseApplyUrl(input)).toBeNull());
});

describe('jobPostingContentSchema (gönderimde tam içerik)', () => {
  it('tam içerik geçer; bağlantı normalleştirilir; metinler kırpılır', () => {
    const parsed = jobPostingContentSchema.parse({
      ...complete,
      title: '  Stajyer  ',
      applyUrl: 'https://Kariyer.example.com/ilan/1',
    });
    expect(parsed.title).toBe('Stajyer'.padEnd(7));
    expect(parsed.applyUrl).toBe('https://kariyer.example.com/ilan/1');
  });

  it.each([
    ['başlık kısa', { title: 'ab' }, 'title'],
    ['başlık uzun', { title: 'a'.repeat(121) }, 'title'],
    ['kurum kısa', { organizationName: 'a' }, 'organizationName'],
    ['açıklama kısa', { description: 'çok kısa' }, 'description'],
    ['açıklama uzun', { description: 'a'.repeat(3001) }, 'description'],
    ['tür geçersiz', { kind: 'VOLUNTEER' }, 'kind'],
    ['hedef bölüm yok', { targetDepartmentIds: [] }, 'targetDepartmentIds'],
    [
      'çok hedef bölüm',
      { targetDepartmentIds: Array.from({ length: 11 }, (_, i) => `d${i}`) },
      'targetDepartmentIds',
    ],
    ['son tarih yok', { deadlineOn: undefined }, 'deadlineOn'],
    ['son tarih biçimi', { deadlineOn: '01.07.2030' }, 'deadlineOn'],
    ['son tarih gerçek değil', { deadlineOn: '2030-02-31' }, 'deadlineOn'],
    ['konum de uzaktan da yok', { location: null, isRemote: false }, 'location'],
    ['URL yöntemi bağlantısız', { applyUrl: null }, 'applyUrl'],
    ['http bağlantı', { applyUrl: 'http://example.com/x' }, 'applyUrl'],
    [
      'iletişim talebi + bağlantı',
      { applyMethod: 'CONTACT_REQUEST', applyUrl: 'https://example.com/x' },
      'applyUrl',
    ],
  ])('%s reddedilir', (_name, patch, field) => {
    const result = jobPostingContentSchema.safeParse({ ...complete, ...patch });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => String(issue.path[0]))).toContain(field);
  });

  it.each([
    ['title', 3, 120],
    ['organizationName', 2, 120],
    ['location', 2, 100],
    ['description', 30, 3000],
  ] as const)('%s sınırları: en az %i, en çok %i karakter (sınır dahil)', (field, min, max) => {
    const ok = (length: number) =>
      jobPostingContentSchema.safeParse({ ...complete, [field]: 'a'.repeat(length) }).success;
    expect(ok(min - 1)).toBe(false);
    expect(ok(min)).toBe(true);
    expect(ok(max)).toBe(true);
    expect(ok(max + 1)).toBe(false);
  });

  it('uzaktan ilan konumsuz, iletişim talebi bağlantısız geçer', () => {
    expect(
      jobPostingContentSchema.safeParse({ ...complete, location: null, isRemote: true }).success,
    ).toBe(true);
    expect(
      jobPostingContentSchema.safeParse({
        ...complete,
        applyMethod: 'CONTACT_REQUEST',
        applyUrl: null,
      }).success,
    ).toBe(true);
  });

  it('hata iletileri kayıtlı hata koduna çevrilir (alan hatası)', () => {
    const url = jobPostingContentSchema.safeParse({ ...complete, applyUrl: 'javascript:alert(1)' });
    const date = jobPostingContentSchema.safeParse({ ...complete, deadlineOn: 'yarın' });
    expect(url.error?.issues[0]?.message).toBe('JOB_POSTING_URL_INVALID');
    expect(date.error?.issues[0]?.message).toBe('JOB_POSTING_DEADLINE_INVALID');
  });

  it('strict: tanınmayan alan (ör. yazar kimliği) reddedilir', () => {
    expect(jobPostingContentSchema.safeParse({ ...complete, authorId: 'u1' }).success).toBe(false);
    expect(jobPostingContentSchema.safeParse({ ...complete, status: 'PUBLISHED' }).success).toBe(
      false,
    );
  });
});

describe('taslak', () => {
  it('boş metin "yok" sayılır, eksik alan geçer', () => {
    const parsed = jobPostingDraftContentSchema.parse({ title: '   ', location: '', applyUrl: '' });
    expect(parsed.title).toBeNull();
    expect(parsed.location).toBeNull();
    expect(parsed.applyUrl).toBeNull();
    expect(jobPostingDraftContentSchema.parse({})).toEqual({});
  });

  it('var olan değer sınırı geçemez; bağlantı varsa https olmalı; hedef en çok 10', () => {
    expect(jobPostingDraftContentSchema.safeParse({ title: 'a'.repeat(121) }).success).toBe(false);
    expect(
      jobPostingDraftContentSchema.safeParse({ applyUrl: 'http://x.example.com' }).success,
    ).toBe(false);
    expect(
      jobPostingDraftContentSchema.safeParse({
        targetDepartmentIds: Array.from({ length: 11 }, (_, i) => `d${i}`),
      }).success,
    ).toBe(false);
    expect(jobPostingDraftContentSchema.safeParse({ deadlineOn: '2030-07-01' }).success).toBe(true);
    expect(jobPostingDraftContentSchema.safeParse({ deadlineOn: '2030-13-01' }).success).toBe(
      false,
    );
  });

  it('kaydetme: bölüm zorunlu, yazar/durum alanı yok (strict)', () => {
    expect(saveJobPostingDraftSchema.safeParse({ departmentId: 'd1', content: {} }).success).toBe(
      true,
    );
    expect(saveJobPostingDraftSchema.safeParse({ content: {} }).success).toBe(false);
    expect(
      saveJobPostingDraftSchema.safeParse({ departmentId: 'd1', content: {}, authorId: 'u1' })
        .success,
    ).toBe(false);
    expect(
      saveJobPostingDraftSchema.safeParse({
        departmentId: 'd1',
        content: { status: 'PUBLISHED' },
      }).success,
    ).toBe(false);
  });
});

describe('arama, moderasyon ve şikâyet girdileri', () => {
  it('arama varsayılanları ve sınırları', () => {
    expect(searchJobPostingsSchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(searchJobPostingsSchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(
      searchJobPostingsSchema.safeParse({ withinDays: JOB_POSTING_MAX_DAYS + 1 }).success,
    ).toBe(false);
    expect(searchJobPostingsSchema.safeParse({ withinDays: 0, remote: true }).success).toBe(true);
    expect(searchJobPostingsSchema.safeParse({ pageSize: 51 }).success).toBe(false);
    expect(searchJobPostingsSchema.safeParse({ kind: 'JOB', extra: 1 }).success).toBe(false);
    expect(getJobPostingSchema.safeParse({ id: '' }).success).toBe(false);
    // konum süzgeci: metin, 2-100 karakter
    expect(searchJobPostingsSchema.parse({ location: '  İstanbul ' }).location).toBe('İstanbul');
    expect(searchJobPostingsSchema.safeParse({ location: 'a' }).success).toBe(false);
    expect(searchJobPostingsSchema.safeParse({ location: 'a'.repeat(101) }).success).toBe(false);
  });

  it('karar: yayımlamada gerekçe yok, reddetmede zorunlu; bilinmeyen karar reddedilir', () => {
    expect(reviewJobPostingSchema.safeParse({ postingId: 'p', decision: 'PUBLISH' }).success).toBe(
      true,
    );
    expect(
      reviewJobPostingSchema.safeParse({ postingId: 'p', decision: 'PUBLISH', reason: 'x' })
        .success,
    ).toBe(false);
    expect(reviewJobPostingSchema.safeParse({ postingId: 'p', decision: 'REJECT' }).success).toBe(
      false,
    );
    expect(
      reviewJobPostingSchema.safeParse({ postingId: 'p', decision: 'REJECT', reason: 'ab' })
        .success,
    ).toBe(false);
    expect(
      reviewJobPostingSchema.safeParse({
        postingId: 'p',
        decision: 'REJECT',
        reason: 'Bağlantı çalışmıyor',
      }).success,
    ).toBe(true);
    expect(reviewJobPostingSchema.safeParse({ postingId: 'p', decision: 'DELETE' }).success).toBe(
      false,
    );
  });

  it('şikâyet: gerekçe 3-1000; liste varsayılanı OPEN; karar PROVIDED/TAKE_DOWN', () => {
    expect(reportJobPostingSchema.safeParse({ postingId: 'p', reason: 'ab' }).success).toBe(false);
    expect(
      reportJobPostingSchema.safeParse({ postingId: 'p', reason: 'Sahte ilan görünüyor' }).success,
    ).toBe(true);
    expect(listJobPostingReportsSchema.parse({}).status).toBe('OPEN');
    for (const decision of ['DISMISS', 'TAKE_DOWN'])
      expect(
        resolveJobPostingReportSchema.safeParse({ reportId: 'r', decision, reason: 'İncelendi' })
          .success,
      ).toBe(true);
    expect(
      resolveJobPostingReportSchema.safeParse({
        reportId: 'r',
        decision: 'RESOLVED',
        reason: 'xyz',
      }).success,
    ).toBe(false);
  });
});

describe('çıktı şemaları: kimlik sızıntısı yok', () => {
  it('okuyucu kartı ve detayı yazar adı/e-postası/kimliği ve moderasyon alanı taşımaz', () => {
    const forbidden = [
      'authorId',
      'author',
      'name',
      'displayName',
      'email',
      'phone',
      'moderatedById',
      'moderationNote',
      'endedById',
      'reporterId',
      'departmentId',
      'status',
    ];
    for (const shape of [jobPostingCardSchema.shape, jobPostingDetailSchema.shape])
      for (const key of forbidden) expect(Object.keys(shape)).not.toContain(key);
    expect(Object.keys(jobPostingCardSchema.shape)).toContain('authorKind');
  });

  it('detayda bağlantı ve iletişim kimliği ayrı, boşalabilir alanlardır', () => {
    expect(jobPostingDetailSchema.shape.applyUrl.safeParse(null).success).toBe(true);
    expect(jobPostingDetailSchema.shape.contactUserId.safeParse(null).success).toBe(true);
  });

  it('moderatör kaydı yazarın yalnız görünen adını ve rolünü taşır (e-posta/telefon yok)', () => {
    expect(Object.keys(jobPostingModerationItemSchema.shape.author.shape).sort()).toEqual([
      'displayName',
      'role',
    ]);
  });

  it('şikâyet çıktısında raportör kimliği yoktur', () => {
    for (const key of ['reporterId', 'reviewedById', 'authorId'])
      expect(Object.keys(jobPostingReportSchema.shape)).not.toContain(key);
  });

  it('yazarın kendi görünümü ve çıktılar strict; sabit durum değerleri', () => {
    expect(Object.keys(myJobPostingViewSchema.shape)).toContain('moderationNote');
    expect(
      submitJobPostingOutputSchema.safeParse({ postingId: 'p', status: 'PENDING' }).success,
    ).toBe(true);
    expect(
      closeJobPostingOutputSchema.safeParse({ postingId: 'p', status: 'PENDING' }).success,
    ).toBe(false);
    expect(
      jobPostingFormContextSchema.safeParse({
        authorDepartments: [],
        targetDepartments: [],
        limits: { maxDays: 60, submitLimit: 5, submitWindowDays: 30, maxTargets: 10 },
      }).success,
    ).toBe(true);
  });
});

describe('eylem kataloğu', () => {
  it('hata kodlarının hepsi kayıtlıdır', () => {
    for (const codes of Object.values(JOB_POSTING_ACTION_ERRORS))
      for (const code of codes) expect(isErrorCode(code)).toBe(true);
  });

  it('her eylemin erişim sınıfı ve hata listesi vardır; yetkisiz erişim kodları her listededir', () => {
    expect(Object.keys(JOB_POSTING_ACTION_ACCESS).sort()).toEqual(
      Object.keys(JOB_POSTING_ACTION_ERRORS).sort(),
    );
    for (const codes of Object.values(JOB_POSTING_ACTION_ERRORS))
      for (const code of ['AUTH_UNAUTHENTICATED', 'AUTH_FORBIDDEN', 'CONSENT_REQUIRED'])
        expect(codes as readonly string[]).toContain(code);
  });
});

describe('süzgeç seçenekleri', () => {
  it('girdi boştur (strict); çıktıda kişi verisi alanı yoktur, listeler sınırlıdır', () => {
    expect(getJobPostingFilterOptionsSchema.safeParse({}).success).toBe(true);
    expect(getJobPostingFilterOptionsSchema.safeParse({ userId: 'u1' }).success).toBe(false);
    const ok = {
      organizations: [{ companyId: null, name: 'Örnek Teknoloji', count: 2 }],
      departments: [{ id: 'd1', name: 'Yönetim Bilişim Sistemleri', count: 3 }],
      locations: [{ name: 'İstanbul', count: 4 }],
      remoteCount: 1,
    };
    expect(jobPostingFilterOptionsSchema.safeParse(ok).success).toBe(true);
    expect(jobPostingFilterOptionsSchema.safeParse({ ...ok, authorId: 'u1' }).success).toBe(false);
    expect(
      jobPostingFilterOptionsSchema.safeParse({
        ...ok,
        locations: Array.from({ length: 101 }, (_, i) => ({ name: `Şehir ${i}`, count: 1 })),
      }).success,
    ).toBe(false);
    expect(
      jobPostingFilterOptionsSchema.safeParse({ ...ok, locations: [{ name: 'x', count: 0 }] })
        .success,
    ).toBe(false);
    for (const key of ['authorId', 'userId', 'email', 'displayName'])
      for (const shape of [
        jobPostingFilterOptionsSchema.shape.organizations.element.shape,
        jobPostingFilterOptionsSchema.shape.departments.element.shape,
        jobPostingFilterOptionsSchema.shape.locations.element.shape,
      ])
        expect(Object.keys(shape)).not.toContain(key);
  });
});

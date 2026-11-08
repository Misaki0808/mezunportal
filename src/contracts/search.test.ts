import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';

import {
  SEARCH_ACTION_ERRORS,
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
  searchExperiencesSchema,
  searchFilterFromParams,
  searchFilterToParams,
  searchPageSchema,
  searchResultSchema,
} from './search';

const ok = (value: unknown) => searchExperiencesSchema.safeParse(value).success;

describe('searchExperiencesSchema', () => {
  it('boş filtre geçerli; varsayılanlar sayfa 1 ve boyut 20', () => {
    expect(searchExperiencesSchema.parse({})).toEqual({
      page: 1,
      pageSize: SEARCH_PAGE_SIZE_DEFAULT,
    });
  });

  it('metin 2–100 karakter, kırpılır', () => {
    expect(ok({ q: 'a' })).toBe(false);
    expect(ok({ q: ' a ' })).toBe(false);
    expect(ok({ q: 'st' })).toBe(true);
    expect(ok({ q: 'x'.repeat(101) })).toBe(false);
    expect(searchExperiencesSchema.parse({ q: '  staj  ' }).q).toBe('staj');
  });

  it('tür ve kanal listeleri bilinen değerlerdir, yinelenemez', () => {
    expect(ok({ types: ['INTERNSHIP', 'ERASMUS'] })).toBe(true);
    expect(ok({ types: ['INTERNSHIP', 'INTERNSHIP'] })).toBe(false);
    expect(ok({ types: ['ROCKET'] })).toBe(false);
    expect(ok({ channels: ['REFERRAL'] })).toBe(true);
    expect(ok({ channels: ['SPAM'] })).toBe(false);
  });

  it('dönem, ücret ve sayfalama sınırları', () => {
    expect(ok({ termYear: 2025, termSeason: 'SUMMER', pay: 'PAID' })).toBe(true);
    expect(ok({ termYear: 1899 })).toBe(false);
    expect(ok({ termYear: 2024.5 })).toBe(false);
    expect(ok({ termSeason: 'MONSOON' })).toBe(false);
    expect(ok({ pay: 'GOLD' })).toBe(false);
    expect(ok({ page: 0 })).toBe(false);
    expect(ok({ page: 201 })).toBe(false);
    expect(ok({ pageSize: SEARCH_PAGE_SIZE_MAX })).toBe(true);
    expect(ok({ pageSize: SEARCH_PAGE_SIZE_MAX + 1 })).toBe(false);
  });

  it('alaka sırası metin ister; kimlik/yetki alanları (kapsam, yazar) kabul edilmez', () => {
    expect(ok({ sort: 'RELEVANCE' })).toBe(false);
    expect(ok({ sort: 'RELEVANCE', q: 'staj' })).toBe(true);
    expect(ok({ sort: 'NEWEST' })).toBe(true);
    for (const extra of ['status', 'authorId', 'departmentId', 'universityId', 'userId']) {
      expect(ok({ [extra]: 'x' }), extra).toBe(false);
    }
  });
});

describe('URL taşıma', () => {
  it('kanonik: alan sırası sabit, listeler sıralı, varsayılanlar atılır', () => {
    const a = searchFilterToParams({
      pay: 'PAID',
      q: 'staj',
      types: ['ERASMUS', 'INTERNSHIP'],
      page: 1,
      pageSize: 20,
    });
    const b = searchFilterToParams({ types: ['INTERNSHIP', 'ERASMUS'], q: 'staj', pay: 'PAID' });
    expect(a.toString()).toBe(b.toString());
    expect(a.toString()).toBe('q=staj&pay=PAID&types=ERASMUS&types=INTERNSHIP');
    expect(searchFilterToParams({ page: 3, pageSize: 10 }).toString()).toBe('pageSize=10&page=3');
    expect(searchFilterToParams({ q: '   ', types: [] }).toString()).toBe('');
  });

  it('gidiş-dönüş: URL → filtre → URL aynıdır ve şemadan geçer', () => {
    const filter = {
      q: 'İstanbul staj',
      company: 'Acme',
      sectorId: 'sektor-1',
      types: ['INTERNSHIP' as const],
      channels: ['REFERRAL' as const, 'LINKEDIN_POST' as const],
      termYear: 2025,
      termSeason: 'SUMMER' as const,
      pay: 'PAID' as const,
      sort: 'RELEVANCE' as const,
      page: 2,
      pageSize: 10,
    };
    const params = searchFilterToParams(filter);
    const parsed = searchExperiencesSchema.parse(
      searchFilterFromParams(new URLSearchParams(params.toString())),
    );
    expect(parsed).toMatchObject({ ...filter, channels: ['LINKEDIN_POST', 'REFERRAL'] });
    expect(searchFilterToParams(parsed).toString()).toBe(params.toString());
  });

  it('bilinmeyen anahtarlar atılır; sayı olmayan sayı alanı şemada reddedilir; Next searchParams biçimi', () => {
    const input = searchFilterFromParams({
      q: 'staj',
      utm_source: 'x',
      types: ['ERASMUS'],
      page: 'abc',
    });
    expect(input).toEqual({ q: 'staj', types: ['ERASMUS'], page: 'abc' });
    expect(ok(input)).toBe(false);
    expect(searchFilterFromParams({ q: 'staj', types: 'ERASMUS' })).toEqual({
      q: 'staj',
      types: ['ERASMUS'],
    });
    expect(searchFilterFromParams(new URLSearchParams('?pay=&q='))).toEqual({});
  });
});

describe('sonuç şeması', () => {
  const base = {
    id: 'e',
    type: 'INTERNSHIP',
    organizationName: 'Acme',
    departmentName: 'Bölüm',
    city: null,
    country: null,
    termYear: 2025,
    termSeason: 'SUMMER',
    durationWeeks: 8,
    pay: 'PAID',
    applicationChannel: 'REFERRAL',
    snippet: 'Ne öğrendim',
    publishedAt: new Date(),
  };

  it('anonim sonuçta yazar alanı eklenemez; adlı sonuçta yazar zorunlu', () => {
    expect(searchResultSchema.safeParse({ ...base, isAnonymous: true }).success).toBe(true);
    expect(
      searchResultSchema.safeParse({
        ...base,
        isAnonymous: true,
        author: { id: 'u', displayName: 'A' },
      }).success,
    ).toBe(false);
    expect(
      searchResultSchema.safeParse({ ...base, isAnonymous: true, authorId: 'u' }).success,
    ).toBe(false);
    expect(searchResultSchema.safeParse({ ...base, isAnonymous: false }).success).toBe(false);
    expect(
      searchResultSchema.safeParse({
        ...base,
        isAnonymous: false,
        author: { id: 'u', displayName: 'A' },
      }).success,
    ).toBe(true);
  });

  it('parça en fazla 220 karakter; sayfa çıktısı katı', () => {
    expect(
      searchResultSchema.safeParse({ ...base, isAnonymous: true, snippet: 'x'.repeat(221) })
        .success,
    ).toBe(false);
    const page = { items: [], page: 1, pageSize: 20, total: 0, hasMore: false, sort: 'NEWEST' };
    expect(searchPageSchema.safeParse(page).success).toBe(true);
    expect(searchPageSchema.safeParse({ ...page, extra: 1 }).success).toBe(false);
  });

  it('hata kodları kayıtlıdır', () => {
    for (const code of SEARCH_ACTION_ERRORS.searchExperiences) expect(ERROR_CODES).toContain(code);
  });
});

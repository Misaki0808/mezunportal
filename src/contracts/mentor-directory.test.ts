import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';

import {
  MENTOR_DIRECTORY_ACTION_ERRORS,
  MENTOR_PAGE_SIZE_DEFAULT,
  MENTOR_PAGE_SIZE_MAX,
  SIMILAR_MENTORS_MAX,
  mentorCardSchema,
  mentorEntryPointsSchema,
  mentorFilterFromParams,
  mentorFilterToParams,
  searchMentorsSchema,
  similarMentorsSchema,
} from './mentor-directory';

const ok = (value: unknown) => searchMentorsSchema.safeParse(value).success;

describe('searchMentorsSchema', () => {
  it('boş filtre geçerli; varsayılanlar', () => {
    expect(searchMentorsSchema.parse({})).toEqual({
      onlyAvailable: false,
      page: 1,
      pageSize: MENTOR_PAGE_SIZE_DEFAULT,
    });
  });

  it('listeler bilinen, boş olmayan ve tekrarsız değerlerdir', () => {
    expect(ok({ mentorTypes: ['ALUMNI', 'ACADEMIC'] })).toBe(true);
    expect(ok({ mentorTypes: [] })).toBe(false);
    expect(ok({ mentorTypes: ['ALUMNI', 'ALUMNI'] })).toBe(false);
    expect(ok({ mentorTypes: ['ADMIN'] })).toBe(false);
    expect(ok({ meetingModes: ['ONLINE', 'IN_PERSON'] })).toBe(true);
    expect(ok({ meetingModes: ['PHONE'] })).toBe(false);
    expect(ok({ experienceTypes: ['INTERNSHIP', 'ERASMUS'] })).toBe(true);
    expect(ok({ experienceTypes: ['ROCKET'] })).toBe(false);
  });

  it('metin süzgeçleri 2–100 karakter, kırpılır', () => {
    expect(ok({ company: 'a' })).toBe(false);
    expect(ok({ title: ' a ' })).toBe(false);
    expect(ok({ company: 'x'.repeat(101) })).toBe(false);
    expect(searchMentorsSchema.parse({ company: '  Acme  ' }).company).toBe('Acme');
  });

  it('sayfalama sınırları; bilinmeyen alan (kimlik/rol dahil) reddedilir', () => {
    expect(ok({ pageSize: MENTOR_PAGE_SIZE_MAX })).toBe(true);
    expect(ok({ pageSize: MENTOR_PAGE_SIZE_MAX + 1 })).toBe(false);
    expect(ok({ page: 0 })).toBe(false);
    expect(ok({ onlyAvailable: 'evet' })).toBe(false);
    expect(ok({ userId: 'baska' })).toBe(false);
    expect(ok({ universityId: 'baska' })).toBe(false);
  });
});

describe('URL taşıma', () => {
  it('kanonik: sıra sabit, varsayılanlar atılır, aynı filtre aynı bağlantı', () => {
    const a = mentorFilterToParams({
      meetingModes: ['ONLINE', 'IN_PERSON'],
      onlyAvailable: true,
      company: ' Acme ',
      mentorTypes: ['ALUMNI'],
      page: 1,
      pageSize: MENTOR_PAGE_SIZE_DEFAULT,
    }).toString();
    const b = mentorFilterToParams({
      mentorTypes: ['ALUMNI'],
      company: 'Acme',
      onlyAvailable: true,
      meetingModes: ['IN_PERSON', 'ONLINE'],
    }).toString();
    expect(a).toBe(b);
    expect(a).toBe(
      'company=Acme&mentorTypes=ALUMNI&meetingModes=IN_PERSON&meetingModes=ONLINE&onlyAvailable=1',
    );
    expect(mentorFilterToParams({}).toString()).toBe('');
  });

  it('gidiş-dönüş filtreyi korur; geçersiz sayı şemaya bırakılır; bilinmeyen anahtar atılır', () => {
    const filter = {
      mentorTypes: ['ACADEMIC', 'ALUMNI'] as const,
      sectorId: 'sek-1',
      title: 'Analist',
      experienceTypes: ['INTERNSHIP'] as const,
      onlyAvailable: true,
      page: 3,
      pageSize: 24,
    };
    const parsed = searchMentorsSchema.parse(
      mentorFilterFromParams(
        mentorFilterToParams({
          ...filter,
          mentorTypes: [...filter.mentorTypes],
          experienceTypes: [...filter.experienceTypes],
        }),
      ),
    );
    expect(parsed).toEqual({
      ...filter,
      mentorTypes: ['ACADEMIC', 'ALUMNI'],
      experienceTypes: ['INTERNSHIP'],
    });
    const bad = mentorFilterFromParams(new URLSearchParams('page=abc&userId=x&onlyAvailable=0'));
    expect(bad).toEqual({ page: 'abc' });
    expect(ok(bad)).toBe(false);
    expect(mentorFilterFromParams({ onlyAvailable: 'true', mentorTypes: ['ALUMNI'] })).toEqual({
      onlyAvailable: true,
      mentorTypes: ['ALUMNI'],
    });
  });
});

describe('çıktı şemaları', () => {
  const card = {
    userId: 'u1',
    displayName: 'Ayşe Örnek',
    headline: null,
    mentorType: 'ALUMNI',
    departmentName: 'YBS',
    graduationYear: 2020,
    position: { company: 'Acme', title: 'Analist' },
    sectorName: null,
    topics: ['data'],
    skills: ['SQL'],
    availability: { available: true, reason: null, pausedUntil: null },
    capacity: { monthly: 4, used: 1, remaining: 3 },
    sessionMinutes: 30,
    meetingModes: ['ONLINE'],
    cvReviewEnabled: false,
  };

  it('kart e-posta/telefon gibi ek alan kabul etmez', () => {
    expect(mentorCardSchema.safeParse(card).success).toBe(true);
    expect(mentorCardSchema.safeParse({ ...card, email: 'a@b.co' }).success).toBe(false);
    expect(mentorCardSchema.safeParse({ ...card, phone: '0532' }).success).toBe(false);
    expect(mentorCardSchema.safeParse({ ...card, skills: Array(6).fill('x') }).success).toBe(false);
  });

  it('benzer yol listesi en çok 5 öğe, her öğede en az bir gerekçe', () => {
    const item = { mentor: card, reasons: [{ code: 'SAME_SECTOR', values: ['Finans'] }] };
    expect(
      similarMentorsSchema.safeParse({ items: Array(SIMILAR_MENTORS_MAX).fill(item) }).success,
    ).toBe(true);
    expect(
      similarMentorsSchema.safeParse({ items: Array(SIMILAR_MENTORS_MAX + 1).fill(item) }).success,
    ).toBe(false);
    expect(similarMentorsSchema.safeParse({ items: [{ mentor: card, reasons: [] }] }).success).toBe(
      false,
    );
    expect(
      similarMentorsSchema.safeParse({
        items: [{ mentor: card, reasons: [{ code: 'SAME_SECTOR', values: ['a', 'b', 'c', 'd'] }] }],
      }).success,
    ).toBe(false);
  });

  it('giriş noktaları üç bayrak taşır', () => {
    const point = { available: false, reason: 'PAUSED' };
    expect(
      mentorEntryPointsSchema.safeParse({ appointment: point, cvReview: point, contact: point })
        .success,
    ).toBe(true);
    expect(mentorEntryPointsSchema.safeParse({ appointment: point, cvReview: point }).success).toBe(
      false,
    );
    expect(
      mentorEntryPointsSchema.safeParse({
        appointment: { available: true, reason: 'X' },
        cvReview: point,
        contact: point,
      }).success,
    ).toBe(false);
  });

  it('hata kodları kayıtlıdır', () => {
    for (const codes of Object.values(MENTOR_DIRECTORY_ACTION_ERRORS)) {
      for (const code of codes) expect(ERROR_CODES).toContain(code);
    }
  });
});

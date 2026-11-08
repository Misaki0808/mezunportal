import { describe, expect, it } from 'vitest';

import { isErrorCode } from '@/lib/errors';

import {
  FAQ_ACTION_ERRORS,
  answerFaqRequestSchema,
  faqItemViewSchema,
  faqModerationItemSchema,
  mentorFaqRequestViewSchema,
  publishFaqSchema,
  redirectFaqSchema,
  rejectFaqSchema,
  searchFaqSchema,
  submitFaqRequestSchema,
} from './faq';

const long = (n: number) => 'a'.repeat(n);

describe('SSS sözleşmesi', () => {
  it('talep: uzunluk sınırları, strict ve varsayılan onay false', () => {
    expect(submitFaqRequestSchema.parse({ question: long(15) }).similarAcknowledged).toBe(false);
    expect(submitFaqRequestSchema.safeParse({ question: long(14) }).success).toBe(false);
    expect(submitFaqRequestSchema.safeParse({ question: long(501) }).success).toBe(false);
    expect(submitFaqRequestSchema.safeParse({ question: long(20), askerId: 'x' }).success).toBe(
      false,
    );
  });
  it('cevap ve yayın: sınırlar, strict, kimlik alanı yok', () => {
    expect(answerFaqRequestSchema.safeParse({ requestId: 'r', body: long(19) }).success).toBe(
      false,
    );
    expect(answerFaqRequestSchema.safeParse({ requestId: 'r', body: long(2001) }).success).toBe(
      false,
    );
    const publish = { requestId: 'r', selectedAnswerId: 'a', question: long(20), answer: long(30) };
    expect(publishFaqSchema.safeParse(publish).success).toBe(true);
    expect(publishFaqSchema.safeParse({ ...publish, publishedById: 'x' }).success).toBe(false);
    expect(publishFaqSchema.safeParse({ ...publish, selectedAnswerId: '' }).success).toBe(false);
    expect(rejectFaqSchema.safeParse({ requestId: 'r', reason: 'x' }).success).toBe(false);
    expect(
      redirectFaqSchema.safeParse({ requestId: 'r', note: 'Mentorluk talebi aç' }).success,
    ).toBe(true);
  });
  it('arama: tek harf reddedilir, sayfa varsayılanları', () => {
    expect(searchFaqSchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(searchFaqSchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
  });
  it('çıktı şemalarında kimlik alanı yoktur (soran, mentor, moderatör)', () => {
    const forbidden = [
      'askerId',
      'mentorId',
      'authorId',
      'publishedById',
      'userId',
      'name',
      'displayName',
    ];
    for (const shape of [
      faqItemViewSchema.shape,
      faqModerationItemSchema.shape,
      mentorFaqRequestViewSchema.shape,
    ])
      for (const key of forbidden) expect(Object.keys(shape)).not.toContain(key);
    expect(Object.keys(faqModerationItemSchema.shape.answers.element.shape).sort()).toEqual([
      'body',
      'id',
    ]);
  });
  it('hata kodlarının hepsi kayıtlıdır', () => {
    for (const codes of Object.values(FAQ_ACTION_ERRORS))
      for (const code of codes) expect(isErrorCode(code)).toBe(true);
  });
});

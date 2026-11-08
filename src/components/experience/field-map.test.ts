import { describe, expect, it } from 'vitest';

import { EXPERIENCE_TYPES } from '@/contracts/experience';

import { fieldsOf, isRequired } from './field-map';
import { emptyState, toContent, validate } from './form-state';

describe('tür bazlı şablon sözleşmeden okunur (D9)', () => {
  it('her tür için alan kümesi vardır ve tür değişince değişir', () => {
    for (const type of EXPERIENCE_TYPES) expect(fieldsOf(type).has('whatLearned')).toBe(true);
    expect(fieldsOf('INTERNSHIP').has('pay')).toBe(true);
    expect(fieldsOf('INTERNSHIP').has('interviewQuestions')).toBe(true);
    expect(fieldsOf('CERTIFICATE').has('pay')).toBe(false);
    expect(fieldsOf('CERTIFICATE').has('applicationChannel')).toBe(false);
    expect(fieldsOf('CLUB').has('applicationChannel')).toBe(false);
    expect(fieldsOf('CLUB').has('country')).toBe(false);
    expect(fieldsOf('ERASMUS').has('pay')).toBe(false);
    expect(fieldsOf('GRADUATE_STUDY').has('interviewQuestions')).toBe(true);
  });

  it('zorunluluk şemadan gelir (ülke Erasmus’ta zorunlu, stajda isteğe bağlı)', () => {
    expect(isRequired('ERASMUS', 'country')).toBe(true);
    expect(isRequired('INTERNSHIP', 'country')).toBe(false);
    expect(isRequired('CERTIFICATE', 'durationWeeks')).toBe(false);
    expect(isRequired('STUDY_ABROAD', 'durationWeeks')).toBe(true);
    expect(isRequired('INTERNSHIP', 'pay')).toBe(true);
  });
});

describe('form içeriği', () => {
  const filled = () => ({
    ...emptyState('INTERNSHIP'),
    organizationName: 'Örnek A.Ş.',
    termYear: '2025',
    termSeason: 'SUMMER',
    durationWeeks: '8',
    pay: 'PAID',
    applicationChannel: 'LINKEDIN_POST',
    whatLearned: 'Çok şey öğrendim.',
    advice: 'Erken başvur.',
  });

  it('tür değişince yalnız yeni türün alanları içeriğe girer (yabancı alan sızmaz)', () => {
    const state = { ...filled(), country: 'Almanya', interviewQuestions: ['Neden biz?'] };
    expect(Object.keys(toContent({ ...state, type: 'CERTIFICATE' })).sort()).toEqual(
      [
        'advice',
        'durationWeeks',
        'organizationName',
        'termSeason',
        'termYear',
        'type',
        'whatLearned',
      ].sort(),
    );
    expect(validate({ ...state, type: 'CERTIFICATE' }, 'submit').ok).toBe(true);
  });

  it('boş alan içeriğe girmez; sayı alanı sayıya döner; boş adım satırı yok sayılır', () => {
    const content = toContent({
      ...filled(),
      processSteps: [
        { title: '', description: '' },
        { title: 'Mülakat', description: 'İki aşama.' },
      ],
      interviewQuestions: ['  ', 'Neden biz?'],
    });
    expect(content).toMatchObject({ termYear: 2025, durationWeeks: 8 });
    expect(content.processSteps).toEqual([{ title: 'Mülakat', description: 'İki aşama.' }]);
    expect(content.interviewQuestions).toEqual(['Neden biz?']);
    expect('country' in content).toBe(false);
  });

  it('taslak yalnız sınırları denetler; gönderme eksik zorunlu alanları alan bazlı bildirir', () => {
    expect(validate(emptyState('INTERNSHIP'), 'draft').ok).toBe(true);
    const result = validate(emptyState('INTERNSHIP'), 'submit');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toMatchObject({
        organizationName: 'required',
        termYear: 'required',
        whatLearned: 'required',
        advice: 'required',
        pay: 'required',
      });
      expect(result.errors).not.toHaveProperty('country');
    }
  });

  it('geçersiz yıl/süre ve fazla uzun metin kendi alanında kendi mesajıyla bildirilir', () => {
    const result = validate(
      { ...filled(), termYear: '1800', durationWeeks: '9999', whatLearned: 'a'.repeat(10_001) },
      'submit',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toMatchObject({
        termYear: 'year',
        durationWeeks: 'weeks',
        whatLearned: 'tooLong',
      });
    }
    const text = validate({ ...filled(), termYear: 'abc' }, 'draft');
    expect(text.ok).toBe(false);
    if (!text.ok) expect(text.errors.termYear).toBe('invalid');
  });

  it('yarım dolu süreç adımı kendi satırında hata verir', () => {
    const result = validate(
      { ...filled(), processSteps: [{ title: 'Mülakat', description: '' }] },
      'draft',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['processSteps.0.description']).toBe('required');
  });
});

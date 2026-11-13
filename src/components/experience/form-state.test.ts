import { describe, expect, it } from 'vitest';

import { FIELD_SECTIONS } from './field-map';
import {
  emptyState,
  fieldFilled,
  formSnapshot,
  sectionComplete,
  type FormState,
} from './form-state';

const input = (state: FormState, over: Partial<Parameters<typeof formSnapshot>[0]> = {}) => ({
  state,
  appliedMonth: '',
  departmentId: 'd1',
  isAnonymous: false,
  ...over,
});
const fields = (id: 'about' | 'process' | 'story') =>
  FIELD_SECTIONS.find((section) => section.id === id)!.fields;

describe('formun kaydedilmemiş değişikliği (özet)', () => {
  it('aynı içerik aynı özeti verir; yazıp eski haline getirmek farklı sayılmaz', () => {
    const base = emptyState();
    expect(formSnapshot(input(base))).toBe(formSnapshot(input(emptyState())));
    const typed = { ...base, organizationName: 'Örnek' };
    expect(formSnapshot(input(typed))).not.toBe(formSnapshot(input(base)));
    expect(formSnapshot(input({ ...typed, organizationName: '' }))).toBe(formSnapshot(input(base)));
  });

  it('formun dışındaki seçimler de özete girer: bölüm, başvuru ayı, anonimlik, liste satırları', () => {
    const base = formSnapshot(input(emptyState()));
    expect(formSnapshot(input(emptyState(), { departmentId: 'd2' }))).not.toBe(base);
    expect(formSnapshot(input(emptyState(), { appliedMonth: '3' }))).not.toBe(base);
    expect(formSnapshot(input(emptyState(), { isAnonymous: true }))).not.toBe(base);
    expect(formSnapshot(input({ ...emptyState(), interviewQuestions: [''] }))).not.toBe(base);
    expect(
      formSnapshot(input({ ...emptyState(), processSteps: [{ title: '', description: '' }] })),
    ).not.toBe(base);
  });
});

describe('alan ve bölüm doluluğu', () => {
  it('boşluk dolu sayılmaz; liste alanında en az bir dolu satır gerekir', () => {
    const state = { ...emptyState(), organizationName: '   ' };
    expect(fieldFilled(state, 'organizationName')).toBe(false);
    expect(fieldFilled({ ...state, organizationName: 'A' }, 'organizationName')).toBe(true);
    expect(fieldFilled({ ...state, interviewQuestions: ['', '  '] }, 'interviewQuestions')).toBe(
      false,
    );
    expect(
      fieldFilled({ ...state, interviewQuestions: ['', 'Neden biz?'] }, 'interviewQuestions'),
    ).toBe(true);
    expect(
      fieldFilled(
        { ...state, processSteps: [{ title: '', description: 'Mülakat' }] },
        'processSteps',
      ),
    ).toBe(true);
  });

  it('bölüm, o türde zorunlu her alan doluyken tamamdır; biri eksikse değildir', () => {
    const empty = emptyState('INTERNSHIP');
    expect(sectionComplete(empty, fields('about'))).toBe(false);
    const filled: FormState = {
      ...empty,
      organizationName: 'Örnek A.Ş.',
      termYear: '2025',
      termSeason: 'SUMMER',
      durationWeeks: '8',
      pay: 'PAID',
    };
    expect(sectionComplete(filled, fields('about'))).toBe(true);
    expect(sectionComplete({ ...filled, durationWeeks: '' }, fields('about'))).toBe(false);
  });

  it('boş liste geçerli olduğu için süreç adımı ve soru satırı bölümü bekletmez', () => {
    const process: FormState = { ...emptyState('INTERNSHIP'), applicationChannel: 'LINKEDIN_POST' };
    expect(sectionComplete(process, fields('process'))).toBe(true);
    expect(sectionComplete({ ...process, applicationChannel: '' }, fields('process'))).toBe(false);
  });

  it('türde sorulmayan alanlar bölümü bekletmez', () => {
    // Sertifika türünde başvuru süreci alanları sorulmaz: bölüm kendiliğinden tamamdır.
    expect(sectionComplete(emptyState('CERTIFICATE'), fields('process'))).toBe(true);
  });
});

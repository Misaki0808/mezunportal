import { describe, expect, it } from 'vitest';

import { pickNextStep } from './next-step';

describe('profilde sıradaki adım', () => {
  it('hesabı açan doğrulama, içerikten ve tercihlerden önce önerilir', () => {
    expect(pickNextStep(['BASICS', 'MEMBERSHIP', 'GOALS'])).toEqual({
      field: 'MEMBERSHIP',
      target: { kind: 'link', href: '/dogrulama' },
    });
  });

  it('içerik adımları tercihlerden önce gelir; öneri girdinin sırasına bağlı değildir', () => {
    expect(pickNextStep(['VISIBILITY', 'SKILLS', 'EDUCATION'])?.field).toBe('EDUCATION');
    expect(pickNextStep(['SKILLS', 'EDUCATION', 'VISIBILITY'])?.field).toBe('EDUCATION');
    expect(pickNextStep(['EDUCATION', 'BASICS'])?.field).toBe('BASICS');
  });

  it('bu sayfadaki alanlar sayfayı terk ettirmez; tercihler başlangıç sayfasına gider', () => {
    expect(pickNextStep(['BASICS'])?.target).toEqual({ kind: 'basics' });
    expect(pickNextStep(['EDUCATION'])?.target).toEqual({ kind: 'education' });
    expect(pickNextStep(['SKILLS'])?.target).toEqual({ kind: 'skills' });
    expect(pickNextStep(['GOALS'])?.target).toEqual({
      kind: 'link',
      href: '/baslangic?duzenle=1',
    });
  });

  it('yalnız CV eksikse ya da eksik yoksa öneri yoktur (CV kartı zaten ayrı görünür)', () => {
    expect(pickNextStep(['CV'])).toBeNull();
    expect(pickNextStep([])).toBeNull();
  });
});

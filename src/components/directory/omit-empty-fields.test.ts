// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { omitEmptyFields } from './omit-empty-fields';

// jsdom `new FormData(form)` sırasında `formdata` olayını tetiklemez (tarayıcılar tetikler): olayı elle gönderiyoruz. Gerçek
// tarayıcı bağlantısı `tests/e2e/search-boundaries.spec.ts`'te (adres `?q=ornek`).
function submitData(form: HTMLFormElement, entries: Array<[string, string | File]>) {
  const formData = new FormData();
  for (const [name, value] of entries) formData.append(name, value);
  form.dispatchEvent(Object.assign(new Event('formdata'), { formData }));
  return [...formData.entries()];
}

describe('omitEmptyFields', () => {
  it('boş metin değerlerini atar, dolu olanları ve sırayı korur', () => {
    const form = document.createElement('form');
    omitEmptyFields(form);

    expect(
      submitData(form, [
        ['q', 'ornek'],
        ['departmentId', ''],
        ['organization', ''],
        ['kind', 'INTERNSHIP'],
        ['withinDays', ''],
      ]),
    ).toEqual([
      ['q', 'ornek'],
      ['kind', 'INTERNSHIP'],
    ]);
  });

  it('hepsi boşsa hiçbir alan kalmaz', () => {
    const form = document.createElement('form');
    omitEmptyFields(form);

    expect(
      submitData(form, [
        ['q', ''],
        ['kind', ''],
      ]),
    ).toEqual([]);
  });

  it('aynı adlı alanlarda yalnız boş olanı atar (dolu olan kalır, sıra aynı)', () => {
    const form = document.createElement('form');
    omitEmptyFields(form);

    expect(
      submitData(form, [
        ['types', 'A'],
        ['types', ''],
        ['types', 'B'],
      ]),
    ).toEqual([
      ['types', 'A'],
      ['types', 'B'],
    ]);
  });

  it('dosya değerlerine dokunmaz (boş dosya bile dosyadır)', () => {
    const form = document.createElement('form');
    omitEmptyFields(form);
    const file = new File([], 'bos.pdf');

    const result = submitData(form, [
      ['file', file],
      ['q', ''],
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]![0]).toBe('file');
    expect((result[0]![1] as File).name).toBe('bos.pdf');
  });

  it('boşluklu metni kullanıcının yazdığı gibi bırakır (kırpmaz, atmaz)', () => {
    const form = document.createElement('form');
    omitEmptyFields(form);

    expect(submitData(form, [['q', ' ']])).toEqual([['q', ' ']]);
  });

  it('temizlik işlevi dinleyiciyi kaldırır; form yoksa bir şey yapmaz', () => {
    const form = document.createElement('form');
    const cleanup = omitEmptyFields(form);
    expect(cleanup).toBeTypeOf('function');
    cleanup!();

    expect(submitData(form, [['q', '']])).toEqual([['q', '']]);
    expect(omitEmptyFields(null)).toBeUndefined();
  });
});

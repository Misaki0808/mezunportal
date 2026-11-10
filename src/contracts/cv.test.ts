import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';
import { failureFromZod } from '@/lib/action-result';

import {
  CV_ACTION_ERRORS,
  CV_LIMITS,
  CV_MAX_BYTES,
  CV_PARSE_FAILURE_CODES,
  applyCvSchema,
  cleanCvText,
  cvUploadFormInput,
  cvUploadFormSchema,
  endsBeforeStart,
  parsedCvItemCount,
  parsedCvJsonSchema,
  parsedCvSchema,
} from './cv';

const position = (overrides: Record<string, unknown> = {}) => ({
  company: 'Deneme A.Ş.',
  title: 'Stajyer',
  ...overrides,
});

describe('cleanCvText', () => {
  it('görünmez/çift yönlü/denetim karakterlerini atar, boşlukları teke indirir', () => {
    expect(cleanCvText('  Yazılım​ ‮Stajyeri\u0000  \n\t Ofis ')).toBe('Yazılım Stajyeri Ofis');
    expect(cleanCvText('﻿⁠')).toBe('');
  });
});

describe('parsedCvSchema (LLM çıktısı güvenilmez girdidir)', () => {
  it('boş nesne geçerlidir ve bölümler boş listeye döner', () => {
    expect(parsedCvSchema.parse({})).toEqual({
      profile: { headline: null, summary: null, city: null },
      education: [],
      positions: [],
      skills: [],
      languages: [],
      certifications: [],
    });
  });

  it('BİLİNMEYEN alanlar her düzeyde atılır: rol/yetki/kimlik şemada yok', () => {
    const parsed = parsedCvSchema.parse({
      role: 'ADMIN',
      userId: 'başkası',
      permissions: ['*'],
      positions: [position({ role: 'ADMIN', isAdmin: true, userId: 'x' })],
      skills: ['SQL'],
    });
    expect(Object.keys(parsed).sort()).toEqual([
      'certifications',
      'education',
      'languages',
      'positions',
      'profile',
      'skills',
    ]);
    expect(Object.keys(parsed.positions[0]!).sort()).toEqual([
      'company',
      'description',
      'employmentType',
      'endDate',
      'isCurrent',
      'startDate',
      'title',
    ]);
  });

  it('metinler temizlenir; temizlik sonrası boş kalan zorunlu metin reddedilir', () => {
    expect(parsedCvSchema.parse({ skills: ['  SQL​  '] }).skills).toEqual(['SQL']);
    expect(parsedCvSchema.safeParse({ skills: ['​​'] }).success).toBe(false);
    expect(parsedCvSchema.safeParse({ positions: [position({ company: '   ' })] }).success).toBe(
      false,
    );
  });

  it('ad alanları sınırlıdır (200); sınırda geçer, bir fazlası reddedilir', () => {
    expect(
      parsedCvSchema.safeParse({ positions: [position({ title: 'a'.repeat(CV_LIMITS.name) })] })
        .success,
    ).toBe(true);
    expect(
      parsedCvSchema.safeParse({ positions: [position({ title: 'a'.repeat(CV_LIMITS.name + 1) })] })
        .success,
    ).toBe(false);
    expect(
      parsedCvSchema.safeParse({ skills: ['a'.repeat(CV_LIMITS.shortName + 1)] }).success,
    ).toBe(false);
  });

  it('açıklama atılmaz KESİLİR (uzun açıklama bütün CV’yi düşürmez)', () => {
    const parsed = parsedCvSchema.parse({
      positions: [position({ description: 'x'.repeat(5000) })],
    });
    expect(parsed.positions[0]?.description).toHaveLength(CV_LIMITS.description);
  });

  it('liste uzunlukları sınırlıdır', () => {
    const tooMany = (key: string, item: unknown, max: number) =>
      parsedCvSchema.safeParse({ [key]: Array.from({ length: max + 1 }, () => item) }).success;
    expect(tooMany('positions', position(), CV_LIMITS.positions)).toBe(false);
    expect(tooMany('skills', 'SQL', CV_LIMITS.skills)).toBe(false);
    expect(tooMany('languages', { name: 'x' }, CV_LIMITS.languages)).toBe(false);
    expect(tooMany('certifications', { name: 'x' }, CV_LIMITS.certifications)).toBe(false);
    expect(tooMany('education', { institution: 'x' }, CV_LIMITS.education)).toBe(false);
    expect(
      parsedCvSchema.safeParse({ skills: Array.from({ length: CV_LIMITS.skills }, () => 'SQL') })
        .success,
    ).toBe(true);
  });

  it.each(['2024', '2024-07', '1950', '2100-12'])('tarih %s geçerli', (date) => {
    expect(parsedCvSchema.safeParse({ positions: [position({ startDate: date })] }).success).toBe(
      true,
    );
  });
  it.each(['24', '2024-13', '2024-00', '2024-7', '1949', '2101-01', '2024/07', 'Temmuz 2024', ''])(
    'tarih %j geçersiz',
    (date) => {
      expect(parsedCvSchema.safeParse({ positions: [position({ startDate: date })] }).success).toBe(
        false,
      );
    },
  );

  it('bitiş başlangıçtan önceyse reddedilir; eksik ay lehine yorumlanır', () => {
    expect(
      parsedCvSchema.safeParse({
        positions: [position({ startDate: '2024-09', endDate: '2024-07' })],
      }).success,
    ).toBe(false);
    expect(
      parsedCvSchema.safeParse({ positions: [position({ startDate: '2024-09', endDate: '2024' })] })
        .success,
    ).toBe(true);
    expect(endsBeforeStart('2023', '2024-01')).toBe(true);
    expect(endsBeforeStart('2024', '2024-12')).toBe(false);
  });

  it('süren kalemin bitiş tarihi atılır (model "Present" yazınca)', () => {
    const parsed = parsedCvSchema.parse({
      positions: [position({ isCurrent: true, startDate: '2024-01', endDate: '2024-06' })],
    });
    expect(parsed.positions[0]).toMatchObject({ isCurrent: true, endDate: null });
  });

  it('enum dışı değerler reddedilir (uydurma tür/seviye)', () => {
    expect(
      parsedCvSchema.safeParse({ positions: [position({ employmentType: 'CEO' })] }).success,
    ).toBe(false);
    expect(parsedCvSchema.safeParse({ languages: [{ name: 'x', level: 'D9' }] }).success).toBe(
      false,
    );
    expect(
      parsedCvSchema.safeParse({ education: [{ institution: 'x', level: 'PHD' }] }).success,
    ).toBe(false);
  });

  it('tür hataları reddedilir', () => {
    expect(parsedCvSchema.safeParse({ positions: 'liste değil' }).success).toBe(false);
    expect(parsedCvSchema.safeParse({ skills: [1, 2] }).success).toBe(false);
    expect(parsedCvSchema.safeParse('metin').success).toBe(false);
    expect(parsedCvSchema.safeParse(null).success).toBe(false);
  });

  it('kalem sayısı ve sağlayıcıya verilen JSON Şeması', () => {
    expect(
      parsedCvItemCount(parsedCvSchema.parse({ skills: ['a', 'b'], languages: [{ name: 'x' }] })),
    ).toBe(3);
    const schema = parsedCvJsonSchema();
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties as object).sort()).toEqual([
      'certifications',
      'education',
      'languages',
      'positions',
      'profile',
      'skills',
    ]);
    expect(JSON.stringify(schema)).not.toMatch(/role|admin|permission|userId/i);
  });
});

describe('parsedProfileSchema (başlık, özet, şehir)', () => {
  it('metinler temizlenir, boş metin null olur, sınırlar uygulanır; bağlantı/iletişim alanı şemada yok', () => {
    const parsed = parsedCvSchema.parse({
      profile: {
        headline: '  Veri\u200B Analisti ',
        summary: '   ',
        city: 'İstanbul',
        linkedinUrl: 'https://evil.example',
        email: 'a@b.co',
        phone: '05321234567',
      },
    });
    expect(parsed.profile).toEqual({ headline: 'Veri Analisti', summary: null, city: 'İstanbul' });
    expect(parsedCvSchema.safeParse({ profile: { headline: 'x'.repeat(121) } }).success).toBe(
      false,
    );
    expect(parsedCvSchema.safeParse({ profile: { summary: 'x'.repeat(1501) } }).success).toBe(
      false,
    );
    expect(parsedCvSchema.safeParse({ profile: { city: 'x'.repeat(81) } }).success).toBe(false);
    expect(parsedCvItemCount(parsedCvSchema.parse({ profile: { city: 'Ankara' } }))).toBe(1);
    expect(parsedCvItemCount(parsedCvSchema.parse({}))).toBe(0);
  });
});

describe('cvUploadFormSchema', () => {
  const pdf = (size = 1024, type = 'application/pdf') =>
    new File([new Uint8Array(size)], 'cv.pdf', { type });
  const errors = (input: unknown) => {
    const result = cvUploadFormSchema.safeParse(input);
    return result.success ? null : failureFromZod(result.error).fieldErrors;
  };

  it('geçerli PDF kabul edilir; yalnız `file` alanı okunur', () => {
    expect(cvUploadFormSchema.safeParse({ file: pdf() }).success).toBe(true);
    const form = new FormData();
    form.set('file', pdf());
    form.set('userId', 'başkası');
    expect(Object.keys(cvUploadFormInput(form))).toEqual(['file']);
  });

  it('sınır testleri: boş, 5 MB tam sınır, 5 MB + 1, PDF olmayan MIME, dosya yok', () => {
    expect(errors({ file: pdf(0) })).toEqual({ file: 'DOCUMENT_EMPTY' });
    expect(errors({ file: pdf(CV_MAX_BYTES) })).toBeNull();
    expect(errors({ file: pdf(CV_MAX_BYTES + 1) })).toEqual({ file: 'DOCUMENT_TOO_LARGE' });
    expect(errors({ file: pdf(10, 'image/png') })).toEqual({ file: 'DOCUMENT_NOT_PDF' });
    expect(errors({})).toEqual({ file: 'DOCUMENT_REQUIRED' });
    expect(errors({ file: 'metin' })).toEqual({ file: 'DOCUMENT_REQUIRED' });
  });
});

describe('applyCvSchema', () => {
  const base = { cvUploadId: 'cv-1' };
  const decision = (key: string, extra: Record<string, unknown> = {}) => ({
    key,
    section: 'SKILL',
    ...extra,
  });

  it('en az bir karar ister; yinelenen anahtar ve fazla karar reddedilir', () => {
    expect(applyCvSchema.safeParse({ ...base, decisions: [] }).success).toBe(false);
    expect(
      applyCvSchema.safeParse({ ...base, decisions: [decision('a'), decision('a')] }).success,
    ).toBe(false);
    expect(
      applyCvSchema.safeParse({
        ...base,
        decisions: Array.from({ length: 201 }, (_, i) => decision(`k${i}`)),
      }).success,
    ).toBe(false);
    expect(
      applyCvSchema.safeParse({ ...base, decisions: [decision('a'), decision('b')] }).success,
    ).toBe(true);
  });

  it('overwriteMine varsayılan false; düzeltilen değer (values) bölümün şemasıyla doğrulanır', () => {
    const ok = applyCvSchema.parse({ ...base, decisions: [decision('a')] });
    expect(ok.decisions[0]?.overwriteMine).toBe(false);
    const bad = applyCvSchema.safeParse({
      ...base,
      decisions: [{ key: 'p', section: 'POSITION', values: { company: '', title: 'x' } }],
    });
    expect(bad.success).toBe(false);
    const edited = applyCvSchema.parse({
      ...base,
      decisions: [
        {
          key: 'p',
          section: 'POSITION',
          values: { company: ' Düzelt A.Ş. ', title: 'Yeni​', role: 'ADMIN' },
        },
      ],
    });
    expect(edited.decisions[0]).toMatchObject({
      values: { company: 'Düzelt A.Ş.', title: 'Yeni' },
    });
    expect(JSON.stringify(edited)).not.toContain('ADMIN');
  });

  it('bilinmeyen bölüm reddedilir', () => {
    expect(
      applyCvSchema.safeParse({ ...base, decisions: [{ key: 'a', section: 'ROLE' }] }).success,
    ).toBe(false);
  });
});

describe('hata kodu kaydı', () => {
  it('eylemlerin bütün hata kodları ve ayrıştırma hata kodları kayıtlıdır', () => {
    const all = new Set<string>(ERROR_CODES);
    for (const codes of Object.values(CV_ACTION_ERRORS))
      for (const code of codes) expect(all.has(code), code).toBe(true);
    for (const code of CV_PARSE_FAILURE_CODES) expect(all.has(code), code).toBe(true);
  });
});

it('LinkedIn PDF kaynağı açıkça doğrulanır; bilinmeyen kaynak reddedilir', () => {
  const form = new FormData();
  form.set('file', new File(['%PDF-1.4'], 'profil.pdf', { type: 'application/pdf' }));
  form.set('source', 'LINKEDIN_PDF');
  expect(cvUploadFormSchema.safeParse(cvUploadFormInput(form)).success).toBe(true);
  form.set('source', 'OTHER');
  expect(cvUploadFormSchema.safeParse(cvUploadFormInput(form)).success).toBe(false);
});

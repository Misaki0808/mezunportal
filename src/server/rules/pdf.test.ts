import { describe, expect, it } from 'vitest';

import { buildTestPdf } from '@/test/pdf';

import { checkCvPdf, inspectPdf } from './pdf';

describe('checkCvPdf', () => {
  it('geçerli tek sayfalık PDF kabul edilir ve sayfa sayısı döner', () => {
    expect(checkCvPdf(buildTestPdf({ text: ['Ad Soyad'] }))).toEqual({ ok: true, pageCount: 1 });
  });

  it.each([1, 2, 3, 4, 5, 6])('%i sayfa kabul edilir', (pages) => {
    expect(checkCvPdf(buildTestPdf({ pages }))).toEqual({ ok: true, pageCount: pages });
  });

  it.each([7, 8, 20])('%i sayfa CV_TOO_MANY_PAGES olur', (pages) => {
    expect(checkCvPdf(buildTestPdf({ pages }))).toEqual({ ok: false, code: 'CV_TOO_MANY_PAGES' });
  });

  it('sayfa nesneleri sıkıştırılmış nesne akışındaysa da sayılır', () => {
    expect(checkCvPdf(buildTestPdf({ pages: 3, objectStreams: true }))).toEqual({
      ok: true,
      pageCount: 3,
    });
    expect(checkCvPdf(buildTestPdf({ pages: 9, objectStreams: true }))).toEqual({
      ok: false,
      code: 'CV_TOO_MANY_PAGES',
    });
  });

  it('ad kaçışıyla gizlenen sayfa türü sayımı atlatamaz (/#50age)', () => {
    expect(checkCvPdf(buildTestPdf({ pages: 9, obfuscatePageNames: true }))).toEqual({
      ok: false,
      code: 'CV_TOO_MANY_PAGES',
    });
  });

  it('şifreli PDF okunamaz sayılır', () => {
    expect(checkCvPdf(buildTestPdf({ encrypted: true }))).toEqual({
      ok: false,
      code: 'CV_PDF_UNREADABLE',
    });
  });

  it('sayfa bulunamayan PDF okunamaz sayılır', () => {
    expect(checkCvPdf(new TextEncoder().encode('%PDF-1.4\nsadece başlık'))).toEqual({
      ok: false,
      code: 'CV_PDF_UNREADABLE',
    });
  });

  it('içerik PDF değilse (uzantı/MIME ne derse desin) DOCUMENT_NOT_PDF', () => {
    expect(checkCvPdf(new TextEncoder().encode('MZ-çalıştırılabilir'))).toEqual({
      ok: false,
      code: 'DOCUMENT_NOT_PDF',
    });
  });

  it('boş dosya ve 5 MB üstü dosya reddedilir; tam 5 MB sınırı kabul edilir', () => {
    expect(checkCvPdf(new Uint8Array())).toEqual({ ok: false, code: 'DOCUMENT_EMPTY' });
    const base = buildTestPdf();
    const exactly = buildTestPdf({ padBytes: 5 * 1024 * 1024 - base.length - 2 });
    expect(exactly.length).toBe(5 * 1024 * 1024);
    expect(checkCvPdf(exactly).ok).toBe(true);
    expect(checkCvPdf(buildTestPdf({ padBytes: 5 * 1024 * 1024 }))).toEqual({
      ok: false,
      code: 'DOCUMENT_TOO_LARGE',
    });
  });

  it('sayfa sınırı parametre olarak değişir', () => {
    expect(checkCvPdf(buildTestPdf({ pages: 3 }), { maxPages: 2 })).toEqual({
      ok: false,
      code: 'CV_TOO_MANY_PAGES',
    });
  });
});

describe('inspectPdf', () => {
  it('/Pages düğümü /Page olarak sayılmaz ve ayrı bir /Count (ör. yer imleri) sayfa sayısını şişirmez', () => {
    const text =
      '%PDF-1.4\n1 0 obj\n<< /Type /Outlines /Count 40 >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 2 >>\nendobj\n' +
      '3 0 obj\n<< /Type /Page >>\nendobj\n4 0 obj\n<< /Type /Page >>\nendobj';
    expect(inspectPdf(new TextEncoder().encode(text))).toEqual({ pageCount: 2, encrypted: false });
  });
});

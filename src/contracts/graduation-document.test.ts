import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';
import { failureFromZod } from '@/lib/action-result';
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from '../server/rules/adminAudit';

import {
  DOCUMENT_MIME_TYPE,
  GRADUATION_DOCUMENT_ACTION_ERRORS,
  GRADUATION_YEAR_MIN,
  MAX_DOCUMENT_BYTES,
  QUEUE_PAGE_SIZE_DEFAULT,
  QUEUE_PAGE_SIZE_MAX,
  REVIEW_REASON_MAX,
  REVIEW_REASON_MIN,
  graduationDocumentFileHref,
  graduationDocumentFormInput,
  graduationDocumentFormSchema,
  hasPdfMagic,
  listPendingGraduationDocumentsSchema,
  pendingGraduationDocumentSchema,
  reviewGraduationDocumentSchema,
} from './graduation-document';

const pdf = (size = 1024, type = DOCUMENT_MIME_TYPE) =>
  new File([new Uint8Array(size)], 'mezuniyet.pdf', { type });
const nextYear = new Date().getFullYear() + 1;

/** Alan → ilk hata kodu (ekranın göreceği biçim). */
function fieldErrors(input: unknown) {
  const result = graduationDocumentFormSchema.safeParse(input);
  return result.success ? null : failureFromZod(result.error).fieldErrors;
}

describe('hasPdfMagic', () => {
  it('yalnız %PDF- ile başlayan içeriği PDF sayar', () => {
    expect(hasPdfMagic(new TextEncoder().encode('%PDF-1.7\n...'))).toBe(true);
    expect(hasPdfMagic(new TextEncoder().encode('%PDF'))).toBe(false); // kısa
    expect(hasPdfMagic(new TextEncoder().encode('<html>%PDF-</html>'))).toBe(false);
    expect(hasPdfMagic(new TextEncoder().encode(' %PDF-1.7'))).toBe(false); // başta boşluk
    expect(hasPdfMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(false); // PNG
    expect(hasPdfMagic(new Uint8Array())).toBe(false);
  });
});

describe('mezun belgesi yükleme formu', () => {
  const valid = { departmentId: 'd1', graduationYear: '2024', file: pdf() };

  it('geçerli formu çözer; FormData metin yılını sayıya çevirir', () => {
    const parsed = graduationDocumentFormSchema.parse(valid);
    expect(parsed.graduationYear).toBe(2024);
    expect(parsed.file.size).toBe(1024);
  });

  it('dosya sınırı: tam 5 MB kabul, 5 MB + 1 bayt DOCUMENT_TOO_LARGE', () => {
    expect(
      graduationDocumentFormSchema.safeParse({ ...valid, file: pdf(MAX_DOCUMENT_BYTES) }).success,
    ).toBe(true);
    expect(fieldErrors({ ...valid, file: pdf(MAX_DOCUMENT_BYTES + 1) })).toEqual({
      file: 'DOCUMENT_TOO_LARGE',
    });
  });

  it('sınır kartta yazılı 5 MB’dir (5.242.880 bayt); sabit bağımsız bir sayıyla sabitlenir', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(5_242_880);
    expect(graduationDocumentFormSchema.safeParse({ ...valid, file: pdf(5_242_880) }).success).toBe(
      true,
    );
    expect(fieldErrors({ ...valid, file: pdf(5_242_881) })).toEqual({ file: 'DOCUMENT_TOO_LARGE' });
  });

  it('boş dosya DOCUMENT_EMPTY', () => {
    expect(fieldErrors({ ...valid, file: pdf(0) })).toEqual({ file: 'DOCUMENT_EMPTY' });
  });

  it.each(['image/png', 'text/plain', 'application/octet-stream', 'application/x-pdf', ''])(
    'tür %j DOCUMENT_NOT_PDF',
    (type) => {
      expect(fieldErrors({ ...valid, file: pdf(10, type) })).toEqual({ file: 'DOCUMENT_NOT_PDF' });
    },
  );

  it('dosya yoksa ya da dosya değilse DOCUMENT_REQUIRED', () => {
    expect(fieldErrors({ ...valid, file: undefined })).toEqual({ file: 'DOCUMENT_REQUIRED' });
    expect(fieldErrors({ ...valid, file: null })).toEqual({ file: 'DOCUMENT_REQUIRED' });
    expect(fieldErrors({ ...valid, file: 'belge.pdf' })).toEqual({ file: 'DOCUMENT_REQUIRED' });
  });

  it('mezuniyet yılı sınırları: alt sınır dahil, gelecek yıl dahil, ötesi VALIDATION_INVALID', () => {
    for (const year of [String(GRADUATION_YEAR_MIN), String(nextYear)]) {
      expect(
        graduationDocumentFormSchema.safeParse({ ...valid, graduationYear: year }).success,
        year,
      ).toBe(true);
    }
    for (const year of [
      String(GRADUATION_YEAR_MIN - 1),
      String(nextYear + 1),
      '',
      'abc',
      '2024.5',
    ]) {
      expect(fieldErrors({ ...valid, graduationYear: year }), year).toEqual({
        graduationYear: 'VALIDATION_INVALID',
      });
    }
  });

  it('bölüm kimliği zorunlu', () => {
    expect(fieldErrors({ ...valid, departmentId: '' })).toEqual({
      departmentId: 'VALIDATION_INVALID',
    });
    expect(fieldErrors({ ...valid, departmentId: undefined })).toEqual({
      departmentId: 'VALIDATION_INVALID',
    });
  });

  it('birden çok hata alan alan raporlanır', () => {
    expect(fieldErrors({ departmentId: '', graduationYear: '1800', file: pdf(0) })).toEqual({
      departmentId: 'VALIDATION_INVALID',
      graduationYear: 'VALIDATION_INVALID',
      file: 'DOCUMENT_EMPTY',
    });
  });

  it('graduationDocumentFormInput FormData’dan yalnız bilinen alanları alır', () => {
    const formData = new FormData();
    formData.set('departmentId', 'd1');
    formData.set('graduationYear', '2024');
    formData.set('file', pdf());
    formData.set('userId', 'baskasi');
    formData.set('status', 'APPROVED');

    const input = graduationDocumentFormInput(formData);

    expect(Object.keys(input).sort()).toEqual(['departmentId', 'file', 'graduationYear']);
    expect(graduationDocumentFormSchema.safeParse(input).success).toBe(true);
  });

  it('dosya SEÇİLMEMİŞSE tarayıcının adsız boş File\'ı "eksik" sayılır; adı olan boş dosya DOCUMENT_EMPTY kalır', () => {
    const form = (file: File) => {
      const formData = new FormData();
      formData.set('departmentId', 'd1');
      formData.set('graduationYear', '2024');
      formData.set('file', file);
      return formData;
    };

    const unselected = graduationDocumentFormInput(form(new File([], '')));
    expect(unselected.file).toBeNull();
    expect(fieldErrors(unselected)).toEqual({ file: 'DOCUMENT_REQUIRED' });

    const emptyChosen = graduationDocumentFormInput(
      form(new File([], 'bos.pdf', { type: 'application/pdf' })),
    );
    expect(fieldErrors(emptyChosen)).toEqual({ file: 'DOCUMENT_EMPTY' });

    expect(graduationDocumentFormInput(new FormData()).file).toBeNull();
  });
});

describe('yönetici kararı', () => {
  const reasonError = (input: unknown) => {
    const result = reviewGraduationDocumentSchema.safeParse(input);
    return result.success ? null : failureFromZod(result.error).fieldErrors;
  };

  it('onay gerekçesiz geçer', () => {
    expect(
      reviewGraduationDocumentSchema.parse({ decision: 'APPROVE', documentId: 'doc1' }),
    ).toEqual({
      decision: 'APPROVE',
      documentId: 'doc1',
    });
  });

  it('ret gerekçe ister: eksik/boş AUDIT_REASON_REQUIRED, kısa/uzun AUDIT_REASON_INVALID', () => {
    for (const reason of [undefined, '', '   ']) {
      expect(
        reasonError({ decision: 'REJECT', documentId: 'doc1', reason }),
        JSON.stringify(reason),
      ).toEqual({
        reason: 'AUDIT_REASON_REQUIRED',
      });
    }
    for (const reason of ['ab', 'x'.repeat(REVIEW_REASON_MAX + 1)]) {
      expect(reasonError({ decision: 'REJECT', documentId: 'doc1', reason })).toEqual({
        reason: 'AUDIT_REASON_INVALID',
      });
    }
  });

  it('gerekçe sınırları dahil kabul edilir ve kırpılır', () => {
    for (const reason of ['x'.repeat(REVIEW_REASON_MIN), 'x'.repeat(REVIEW_REASON_MAX)]) {
      expect(
        reviewGraduationDocumentSchema.safeParse({ decision: 'REJECT', documentId: 'd', reason })
          .success,
      ).toBe(true);
    }
    expect(
      reviewGraduationDocumentSchema.parse({
        decision: 'REJECT',
        documentId: 'd',
        reason: '  Barkod geçersiz.  ',
      }),
    ).toMatchObject({ reason: 'Barkod geçersiz.' });
  });

  it('bilinmeyen karar ya da eksik belge kimliği reddedilir', () => {
    expect(
      reviewGraduationDocumentSchema.safeParse({ decision: 'DELETE', documentId: 'd' }).success,
    ).toBe(false);
    expect(reviewGraduationDocumentSchema.safeParse({ decision: 'APPROVE' }).success).toBe(false);
    expect(
      reviewGraduationDocumentSchema.safeParse({ decision: 'APPROVE', documentId: '' }).success,
    ).toBe(false);
  });

  it('gerekçe sınırları işlem kaydı politikasıyla aynıdır (sürüklenme koruması)', () => {
    expect(REVIEW_REASON_MIN).toBe(REASON_MIN_LENGTH);
    expect(REVIEW_REASON_MAX).toBe(REASON_MAX_LENGTH);
  });
});

describe('kuyruk', () => {
  it('varsayılan sayfa boyutu uygulanır; sınırlar zorlanır', () => {
    expect(listPendingGraduationDocumentsSchema.parse({}).limit).toBe(QUEUE_PAGE_SIZE_DEFAULT);
    expect(
      listPendingGraduationDocumentsSchema.safeParse({ limit: QUEUE_PAGE_SIZE_MAX }).success,
    ).toBe(true);
    for (const limit of [0, -1, QUEUE_PAGE_SIZE_MAX + 1, 1.5]) {
      expect(listPendingGraduationDocumentsSchema.safeParse({ limit }).success, String(limit)).toBe(
        false,
      );
    }
  });

  it('kuyruk satırı yalnız maskeli e-posta taşır (ham e-posta alanı yok)', () => {
    expect(Object.keys(pendingGraduationDocumentSchema.shape)).toContain('maskedEmail');
    expect(Object.keys(pendingGraduationDocumentSchema.shape)).not.toContain('email');
  });

  it('belge dosya yolu kimliği kaçırır', () => {
    expect(graduationDocumentFileHref('abc')).toBe('/api/graduation-documents/abc/file');
    expect(graduationDocumentFileHref('../x')).toBe('/api/graduation-documents/..%2Fx/file');
  });
});

describe('hata kodu kayıtları', () => {
  it('eylemlerin bütün kodları kayıtlıdır', () => {
    for (const code of Object.values(GRADUATION_DOCUMENT_ACTION_ERRORS).flat()) {
      expect(ERROR_CODES).toContain(code);
    }
  });
});

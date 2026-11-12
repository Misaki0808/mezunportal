import { describe, expect, it } from 'vitest';
import { CV_MAX_BYTES, CV_MAX_PAGES } from '@/contracts/cv';
import { buildRealTestPdf } from '@/test/real-pdf';
import { encryptedTestPdf } from '@/test/encrypted-pdf';
import { getDocumentProxy } from 'unpdf';
import { getPdfTextExtractor } from './pdf-text';

describe('gerçek PDF metin çıkarıcı', () => {
  it('tek ve çok sayfalı sentetik belgelerden metni çıkarır', async () => {
    const extractor = getPdfTextExtractor();
    expect(extractor.kind).toBe('real');
    expect(await extractor.extract(buildRealTestPdf(['Experience Sample Company']))).toContain(
      'Sample Company',
    );
    const text = await extractor.extract(
      buildRealTestPdf(['Experience', 'Education', 'Skills SQL']),
    );
    expect(text).toContain('Experience');
    expect(text).toContain('Education');
    expect(text).toContain('Skills SQL');
  });
  it('boyut ve sayfa sınırını, bozuk dosyayı kararlı kodla reddeder', async () => {
    const extractor = getPdfTextExtractor();
    await expect(extractor.extract(new Uint8Array(CV_MAX_BYTES + 1))).rejects.toMatchObject({
      code: 'DOCUMENT_TOO_LARGE',
    });
    await expect(
      extractor.extract(buildRealTestPdf(Array(CV_MAX_PAGES + 1).fill('Sample'))),
    ).rejects.toMatchObject({ code: 'CV_TOO_MANY_PAGES' });
    await expect(
      extractor.extract(new Uint8Array(Buffer.from('%PDF-bozuk'))),
    ).rejects.toMatchObject({ code: 'CV_PDF_UNREADABLE' });
  });
  it('güvenilir maskeleme olmadan gerçek sağlayıcıya hazır görünmez', () => {
    expect(getPdfTextExtractor().redact).toBeUndefined();
  });
  it('gerçek şifreli belgeyi parola istemeden güvenli hata ile reddeder', async () => {
    const unlocked = await getDocumentProxy(encryptedTestPdf(), {
      password: 'user',
    });
    expect(unlocked.numPages).toBe(1);
    await expect(getPdfTextExtractor().extract(encryptedTestPdf())).rejects.toMatchObject({
      code: 'CV_PDF_UNREADABLE',
    });
  });
});

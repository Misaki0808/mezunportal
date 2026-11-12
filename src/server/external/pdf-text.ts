import { redactCvText } from '../rules/redactCvText';

/** PDF metni yalnız bellekte işlenir; uygulamalar belgeyi veya çıkarılan metni loglamaz. */
export interface PdfTextExtractor {
  readonly kind?: 'fake' | 'real';
  extract(pdf: Uint8Array): Promise<string>;
  /** Gerçek sağlayıcıdan önce kişisel verileri temizler; yoksa LinkedIn içe aktarma kapalıdır. */
  redact?(text: string, ownerName: string): Promise<string>;
}

/** Gerçek çıkarıcıya saf yerel maskeleyiciyi bağlar; sahte portu gerçekmiş gibi göstermez. */
export function withCvTextRedaction(extractor: PdfTextExtractor | null): PdfTextExtractor | null {
  if (!extractor || extractor.kind !== 'real') return extractor;
  return {
    kind: 'real',
    extract: (pdf) => extractor.extract(pdf),
    redact: async (text, ownerName) => redactCvText(text, ownerName),
  };
}

/** Yalnız sahte sağlayıcıyla yerel akış testi; PDF'deki gerçek metni ÇIKARMAZ. */
export function createFakePdfTextExtractor(): PdfTextExtractor {
  return {
    kind: 'fake',
    async extract() {
      return 'Experience\nSample Company\nEducation\nSample School\nSkills\nSQL';
    },
  };
}

/** Gerçek çıkarıcı henüz kurulu değil. Sağlayıcı bağlandığında gerçek port buradan döner. */
export function getPdfTextExtractor(): PdfTextExtractor | null {
  return null;
}

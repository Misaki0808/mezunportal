/** PDF metni yalnız bellekte işlenir; uygulamalar belgeyi veya çıkarılan metni loglamaz. */
export interface PdfTextExtractor {
  readonly kind?: 'fake' | 'real';
  extract(pdf: Uint8Array): Promise<string>;
  /** Gerçek sağlayıcıdan önce kişisel verileri temizler; yoksa LinkedIn içe aktarma kapalıdır. */
  redact?(text: string): Promise<string>;
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

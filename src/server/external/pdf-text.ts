/** PDF metni yalnız bellekte işlenir; uygulamalar belgeyi veya çıkarılan metni loglamaz. */
export interface PdfTextExtractor {
  extract(pdf: Uint8Array): Promise<string>;
}

/** Yalnız sahte sağlayıcıyla yerel akış testi; PDF'deki gerçek metni ÇIKARMAZ. */
export function createFakePdfTextExtractor(): PdfTextExtractor {
  return {
    async extract() {
      return 'Experience\nSample Company\nEducation\nSample School\nSkills\nSQL';
    },
  };
}

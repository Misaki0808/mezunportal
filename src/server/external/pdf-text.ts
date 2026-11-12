import 'server-only';

import { Worker } from 'node:worker_threads';
import { CV_MAX_BYTES, CV_MAX_PAGES } from '@/contracts/cv';
import { codedValidation, type ErrorCode } from '@/lib/errors';
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

const MAX_TEXT = 200_000;
const EXTRACTION_TIMEOUT_MS = 5_000;
// V8 yığın sınırı (`maxOldGenerationSizeMb`) ArrayBuffer'ları kapsamaz: 5 MB'lık bir sıkıştırma bombası PDF.js'te
// gigabaytlara açılıp süreci öldürebilir. Çıkarma sırasında süreç RSS'i bu kadar büyürse iş parçacığı sonlandırılır.
const MAX_RSS_GROWTH_BYTES = 384 * 1024 * 1024;
const WATCHDOG_INTERVAL_MS = 25;

export type PdfTextLimits = { timeoutMs?: number; maxRssGrowthBytes?: number };

/** Güvenilmeyen PDF ayrı iş parçacığında sınırlanır; süre ya da bellek dolunca gerçekten sonlandırılır. */
export function getPdfTextExtractor(limits: PdfTextLimits = {}): PdfTextExtractor {
  const timeoutMs = limits.timeoutMs ?? EXTRACTION_TIMEOUT_MS;
  const maxRssGrowth = limits.maxRssGrowthBytes ?? MAX_RSS_GROWTH_BYTES;
  return {
    kind: 'real',
    async extract(pdf) {
      if (pdf.byteLength > CV_MAX_BYTES) throw codedValidation('DOCUMENT_TOO_LARGE');
      if (pdf.byteLength < 5 || Buffer.from(pdf.subarray(0, 5)).toString('ascii') !== '%PDF-')
        throw codedValidation('CV_PDF_UNREADABLE');
      const worker = new Worker(new URL('./pdf-text-worker.mjs', import.meta.url), {
        workerData: { bytes: Uint8Array.from(pdf), maxPages: CV_MAX_PAGES, maxText: MAX_TEXT },
        resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
        stdout: true,
        stderr: true,
      });
      // PDF.js bir belge içeriğini hata çıktısına yazarsa süreç günlüğüne taşınmaz.
      worker.stdout.resume();
      worker.stderr.resume();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let watchdog: ReturnType<typeof setInterval> | undefined;
      try {
        return await new Promise<string>((resolve, reject) => {
          timer = setTimeout(() => reject(codedValidation('CV_PARSE_TIMEOUT')), timeoutMs);
          const baseline = process.memoryUsage.rss();
          watchdog = setInterval(() => {
            if (process.memoryUsage.rss() - baseline > maxRssGrowth)
              reject(codedValidation('CV_PDF_UNREADABLE'));
          }, WATCHDOG_INTERVAL_MS);
          worker.once('message', (result: { text?: unknown; code?: ErrorCode }) => {
            if (typeof result.text === 'string') resolve(result.text);
            else
              reject(
                codedValidation(
                  result.code === 'CV_TOO_MANY_PAGES' ? result.code : 'CV_PDF_UNREADABLE',
                ),
              );
          });
          worker.once('error', () => reject(codedValidation('CV_PDF_UNREADABLE')));
          worker.once('exit', (code) => {
            if (code !== 0) reject(codedValidation('CV_PDF_UNREADABLE'));
          });
        });
      } finally {
        if (timer) clearTimeout(timer);
        if (watchdog) clearInterval(watchdog);
        await worker.terminate();
      }
    },
  };
}

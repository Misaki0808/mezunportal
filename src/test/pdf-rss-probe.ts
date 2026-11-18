/** RSS'in önceki PDF işçilerinden kalan belleği kullanmaması için her sınama ayrı süreçte çalışır. */
import { CV_MAX_BYTES } from '@/contracts/cv';
import { getPdfTextExtractor } from '@/server/external/pdf-text';
import { buildFlateBombPdf } from './real-pdf';

const limit = 32 * 1024 * 1024;
const bomb = buildFlateBombPdf(64);
const samples: number[] = [];
const readRss = process.memoryUsage.rss;
process.memoryUsage.rss = () => {
  const value = readRss();
  samples.push(value);
  return value;
};
let code = 'SUCCESS';
try {
  await getPdfTextExtractor({ maxRssGrowthBytes: limit }).extract(bomb);
} catch (error) {
  code = (error as { code?: string }).code ?? 'UNKNOWN';
} finally {
  process.memoryUsage.rss = readRss;
}
process.stdout.write(
  JSON.stringify({
    code,
    compressedWithinLimit: bomb.byteLength < CV_MAX_BYTES,
    rssExceeded: samples.some((value) => value - samples[0]! > limit),
  }),
);

import { inflateSync } from 'node:zlib';

import { CV_MAX_BYTES, CV_MAX_PAGES } from '@/contracts/cv';
import { hasPdfMagic } from '@/contracts/graduation-document';
import type { ErrorCode } from '@/lib/errors';

/**
 * CV PDF'i için içerik denetimi (saf; yeni bağımlılık yok). Uzantıya/MIME'a değil bayt içeriğine bakar:
 * sihirli bayt, şifreli PDF ve sayfa sayısı. Sayfa sayımı SEZGİSELDİR (tam PDF ayrıştırıcı değildir):
 * sayfa nesneleri ile `/Pages` düğümlerinin `/Count` değerinin büyüğü alınır; sıkıştırılmış nesne
 * akışları (`/ObjStm`) açılır, ad kaçışları (`/#50age`) çözülür. Maliyetin asıl sınırı 5 MB + günlük sınır +
 * sağlayıcı harcama sınırıdır; bu denetim kasıtsız aşırı uzun CV'leri erken ve ucuz eler.
 */

export type CvPdfCheck =
  | { ok: true; pageCount: number }
  | {
      ok: false;
      code: Extract<
        ErrorCode,
        | 'DOCUMENT_EMPTY'
        | 'DOCUMENT_TOO_LARGE'
        | 'DOCUMENT_NOT_PDF'
        | 'CV_PDF_UNREADABLE'
        | 'CV_TOO_MANY_PAGES'
      >;
    };

/** Sıkıştırılmış nesne akışından açılacak en fazla bayt (sıkıştırma bombası koruması). */
const MAX_INFLATED_BYTES = 8 * 1024 * 1024;
const MAX_OBJECT_STREAMS = 64;

function inflateObjectStreams(bytes: Uint8Array, text: string): string {
  const parts: string[] = [];
  let found = 0;
  for (const match of text.matchAll(/\/Type\s*\/ObjStm\b/g)) {
    if (found >= MAX_OBJECT_STREAMS) break;
    const streamKeyword = text.indexOf('stream', match.index);
    if (streamKeyword < 0) continue;
    let start = streamKeyword + 'stream'.length;
    if (bytes[start] === 0x0d) start += 1;
    if (bytes[start] === 0x0a) start += 1;
    const end = text.indexOf('endstream', start);
    if (end < 0) continue;
    found += 1;
    try {
      const inflated = inflateSync(bytes.subarray(start, end), {
        maxOutputLength: MAX_INFLATED_BYTES,
      });
      parts.push(inflated.toString('latin1'));
    } catch {
      // Açılamayan akış sayıma katılmaz; sayfa bulunamazsa dosya "okunamadı" sayılır.
    }
  }
  return parts.join('\n');
}

export function inspectPdf(bytes: Uint8Array): { pageCount: number; encrypted: boolean } {
  const raw = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
  // Ad kaçışları (`/#50age` = `/Page`) çözülür; yoksa sayım atlatılabilirdi.
  const decodeNames = (source: string) =>
    source.replace(/#([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  const scanned = decodeNames(`${raw}\n${inflateObjectStreams(bytes, raw)}`);

  const leafPages = [...scanned.matchAll(/\/Type\s*\/Page(?![A-Za-z])/g)].length;
  let declaredPages = 0;
  for (const objectBody of scanned.split('endobj')) {
    if (!/\/Type\s*\/Pages(?![A-Za-z])/.test(objectBody)) continue;
    const count = /\/Count\s+(\d{1,6})\b/.exec(objectBody);
    if (count?.[1]) declaredPages = Math.max(declaredPages, Number(count[1]));
  }
  return {
    pageCount: Math.max(leafPages, declaredPages),
    encrypted: /\/Encrypt\b/.test(scanned),
  };
}

export function checkCvPdf(
  bytes: Uint8Array,
  limits: { maxBytes?: number; maxPages?: number } = {},
): CvPdfCheck {
  const maxBytes = limits.maxBytes ?? CV_MAX_BYTES;
  const maxPages = limits.maxPages ?? CV_MAX_PAGES;
  if (bytes.length === 0) return { ok: false, code: 'DOCUMENT_EMPTY' };
  if (bytes.length > maxBytes) return { ok: false, code: 'DOCUMENT_TOO_LARGE' };
  if (!hasPdfMagic(bytes)) return { ok: false, code: 'DOCUMENT_NOT_PDF' };
  const { pageCount, encrypted } = inspectPdf(bytes);
  // Şifreli PDF'nin akışları okunamaz; sayfa sayısı da güvenilmezdir.
  if (encrypted || pageCount < 1) return { ok: false, code: 'CV_PDF_UNREADABLE' };
  if (pageCount > maxPages) return { ok: false, code: 'CV_TOO_MANY_PAGES' };
  return { ok: true, pageCount };
}

import { deflateSync } from 'node:zlib';

/** Gerçek PDF okuyucuların açabildiği, tamamı sentetik ASCII metinli test belgesi. */
export function buildRealTestPdf(pages: string[]): Uint8Array {
  const pageIds = pages.map((_, index) => 3 + index * 2);
  const fontId = 3 + pages.length * 2;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`,
  ];
  for (let index = 0; index < pages.length; index++) {
    const safe = pages[index]!.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, ' ');
    const stream = `BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageIds[index]! + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}

/** Küçük dosya, `megabytes` MB'a açılan Flate içerik akışı (sıkıştırma bombası denemesi); metni yoktur. */
export function buildFlateBombPdf(megabytes: number): Uint8Array {
  const packed = deflateSync(Buffer.alloc(megabytes * 1024 * 1024), { level: 9 });
  const head = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n' +
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n' +
      `4 0 obj\n<< /Filter /FlateDecode /Length ${packed.length} >>\nstream\n`,
  );
  return new Uint8Array(
    Buffer.concat([
      head,
      packed,
      Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'),
    ]),
  );
}

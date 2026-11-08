import { deflateSync } from 'node:zlib';

/**
 * Test PDF üreticisi (yeni bağımlılık yok): içerik ve sayfa sayısı ayarlanabilen küçük, SENTETİK PDF'ler.
 * Gerçek bir görüntüleyici için eksiksiz değildir (çapraz başvuru tablosu yok); `rules/pdf` ve sahte
 * adaptörün okuduğu yapıyı üretir. Gerçek kişi verisi içermez.
 */
export type TestPdfOptions = {
  /** Sayfa sayısı (varsayılan 1). */
  pages?: number;
  /** Sayfa metni; verilmezse görünür metin yazılmaz (taranmış CV gibi yalnız görüntü). */
  text?: string[];
  /** Beyaz yazıyla gizlenmiş metin (prompt injection denemesi). */
  hiddenText?: string;
  /** Sahte adaptörün okuduğu senaryo kimliği (`%FAKE-CV:<kimlik>`). */
  scenario?: string;
  /** Sayfa nesnelerini sıkıştırılmış nesne akışına koy. */
  objectStreams?: boolean;
  /** Şifreli PDF (Encrypt sözlüğü). */
  encrypted?: boolean;
  /** `/Type /Page` yazımını ad kaçışıyla gizle. */
  obfuscatePageNames?: boolean;
  /** Dosyayı büyüt (sınır testleri). */
  padBytes?: number;
};

const escapePdf = (value: string) => value.replace(/[\\()]/g, (char) => `\\${char}`);

export function buildTestPdf(options: TestPdfOptions = {}): Uint8Array {
  const pages = options.pages ?? 1;
  const pageType = options.obfuscatePageNames ? '/#50age' : '/Page';
  const objects: string[] = [];
  const pageObjects: string[] = [];
  for (let index = 0; index < pages; index += 1) {
    const lines = [
      ...(options.text && index === 0 ? options.text : []),
      ...(options.hiddenText && index === 0 ? [`1 1 1 rg ${options.hiddenText}`] : []),
    ];
    const content = lines.map((line) => `BT (${escapePdf(line)}) Tj ET`).join('\n');
    pageObjects.push(
      `<< /Type ${pageType} /Parent 2 0 R /Contents ${10 + index} 0 R /Length ${content.length} >>`,
    );
    objects.push(
      `${10 + index} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj`,
    );
  }
  const pagesDictionary = `<< /Type /Pages /Count ${pages} /Kids [] >>`;
  let body: string;
  if (options.objectStreams) {
    const packed = [pagesDictionary, ...pageObjects].join('\n');
    const compressed = deflateSync(Buffer.from(packed, 'latin1')).toString('latin1');
    body = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
      `3 0 obj\n<< /Type /ObjStm /N ${pages + 1} /First 0 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n${compressed}\nendstream\nendobj`,
      ...objects,
    ].join('\n');
  } else {
    body = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
      `2 0 obj\n${pagesDictionary}\nendobj`,
      ...pageObjects.map((dictionary, index) => `${20 + index} 0 obj\n${dictionary}\nendobj`),
      ...objects,
    ].join('\n');
  }
  const trailer = `trailer\n<< /Root 1 0 R${options.encrypted ? ' /Encrypt 99 0 R' : ''} >>\n%%EOF`;
  const scenario = options.scenario ? `%FAKE-CV:${options.scenario}\n` : '';
  const padding = options.padBytes ? `\n%${'x'.repeat(options.padBytes)}` : '';
  return new Uint8Array(
    Buffer.from(`%PDF-1.4\n${scenario}${body}\n${trailer}${padding}`, 'latin1'),
  );
}

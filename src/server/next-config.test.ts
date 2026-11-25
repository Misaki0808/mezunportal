import { describe, expect, it } from 'vitest';

import { createRequire } from 'node:module';

import { MAX_DOCUMENT_BYTES } from '@/contracts/graduation-document';
import { API_CSP, INLINE_PDF_CSP, INLINE_PDF_SOURCES } from '@/lib/api-security-headers';

import nextConfig from '../../next.config';

// Next'in kendi (derlenmiş) yol eşleyicisi: `headers()` kaynaklarını Next ile aynı kuralla eşler. Tür bildirimi yok.
const { pathToRegexp } = createRequire(import.meta.url)('next/dist/compiled/path-to-regexp') as {
  pathToRegexp: (source: string) => RegExp;
};

it('eski mülakat adresi yeni adrese kalıcı yönlenir', async () => {
  expect(await nextConfig.redirects?.()).toContainEqual({
    source: '/mulakat-sorulari',
    destination: '/mulakat-tuyolari',
    permanent: true,
  });
});

// Next.js 16 sunucu eylemi gövde sınırı varsayılan 1 MB'dır; 5 MB PDF yüklemek için artırılır.
describe('next.config: sunucu eylemi gövde sınırı', () => {
  it('belge sınırını (5 MB) ve çok parçalı form zarfını karşılar, makul bir üst sınırı aşmaz', () => {
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
    expect(limit).toBe('6mb');
    const bytes = 6 * 1024 * 1024;
    expect(bytes).toBeGreaterThan(MAX_DOCUMENT_BYTES);
    expect(bytes).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES * 1.25); // gereksiz geniş değil
  });
});

/**
 * Next, aynı anahtarı SONRAKİ eşleşen kuralla ezer ve rota işleyicisinin kendi başlığını da ezer (üretimde ölçüldü, kart 531/533).
 * Bu yüzden her yol için ETKİN başlık, kuralları Next'in kendi eşleyicisiyle sırayla uygulayarak hesaplanır.
 */
async function effectiveHeaders(path: string) {
  const rules = (await nextConfig.headers?.()) ?? [];
  const merged = new Map<string, string>();
  for (const rule of rules)
    if (pathToRegexp(rule.source).test(path))
      for (const header of rule.headers) merged.set(header.key, header.value);
  return merged;
}

describe('next.config: API yanıt başlıkları (etkin değer, rota rota)', () => {
  it.each([
    ['CV sahibine indirme (attachment)', '/api/hesabim/cv/abc'],
    ['veri dökümü (attachment)', '/api/hesabim/veri-dokumu'],
    ['yönetim raporu (attachment)', '/api/yonetim/rapor/kullanim'],
    ['takvim dosyası (attachment)', '/api/randevu/abc/ics'],
    ['profil fotoğrafı (görsel)', '/api/profil-fotografi/abc'],
    ['sağlık (JSON)', '/api/health'],
  ])('%s: en dar API politikası + no-referrer', async (_label, path) => {
    const headers = await effectiveHeaders(path);
    // Sabit değerler KASITLI olarak metinle yazılır: sabiti değiştirmek testi sessizce uyduramasın.
    expect(headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'; sandbox",
    );
    expect(API_CSP).toBe("default-src 'none'; frame-ancestors 'none'; sandbox");
    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it.each([
    ['mezun belgesi (satır içi PDF)', '/api/graduation-documents/abc/file'],
    ['CV inceleme dosyası (satır içi PDF)', '/api/cv-inceleme/abc/dosya'],
  ])("%s: sandbox'sız en sıkı politika + no-referrer", async (_label, path) => {
    const headers = await effectiveHeaders(path);
    expect(headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(INLINE_PDF_CSP).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(headers.get('Content-Security-Policy')).not.toContain('sandbox');
    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('satır içi PDF kaynak listesi tam bu iki yolu kapsar (yeni satır içi PDF rotası listeye eklenmeden etkin olmaz)', () => {
    expect([...INLINE_PDF_SOURCES].sort()).toEqual([
      '/api/cv-inceleme/:id/dosya',
      '/api/graduation-documents/:id/file',
    ]);
  });

  it('sayfalar ve statik dosyalar genel sayfa politikasını korur; X-Frame-Options ve nosniff her yolda', async () => {
    for (const path of ['/', '/giris', '/hesap/veriler', '/_next/static/chunks/a.js']) {
      const headers = await effectiveHeaders(path);
      expect(headers.get('Content-Security-Policy')).toContain("script-src 'self'");
      expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    }
    for (const path of ['/giris', '/api/health', '/api/graduation-documents/abc/file']) {
      const headers = await effectiveHeaders(path);
      expect(headers.get('X-Frame-Options')).toBe('DENY');
      expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    }
  });
});

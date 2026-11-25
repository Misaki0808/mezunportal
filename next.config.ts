import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

import {
  API_CSP,
  API_REFERRER_POLICY,
  INLINE_PDF_CSP,
  INLINE_PDF_SOURCES,
} from './src/lib/api-security-headers';
import { nextLogging } from './src/lib/dev-logging';

const isProduction = process.env.NODE_ENV === 'production';
// HSTS yalnız canlıda (P1-18); yerelde http ile açılır.
const isLive = process.env.APP_ENV === 'prod';

// İçerik güvenlik politikası (docs/security.md "Güvenlik başlıkları"). Next.js satır içi betik
// kullandığı için `script-src` 'unsafe-inline' taşır; nonce'lu sıkılaştırma Faz 1 sonrası değerlendirilir
// (docs/decisions.md). Geliştirmede React'in hata ayıklaması 'unsafe-eval', HMR ise ws bağlantısı ister.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isProduction ? '' : ' ws: wss:'}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isLive
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

// API yanıtları sayfa politikasını değil en dar politikayı taşır. `headers()` aynı anahtarı SONRAKİ kural ezer:
// genel kural önce, API kuralı sonra, satır içi PDF istisnaları en sonda gelir (sıra yapılandırma testiyle korunur).
const apiHeaders = [
  { key: 'Content-Security-Policy', value: API_CSP },
  { key: 'Referrer-Policy', value: API_REFERRER_POLICY },
];
const inlinePdfHeaders = [
  { key: 'Content-Security-Policy', value: INLINE_PDF_CSP },
  { key: 'Referrer-Policy', value: API_REFERRER_POLICY },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(process.env.APP_ENV === 'test' && /^[01]$/.test(process.env.E2E_NEXT_INSTANCE ?? '')
    ? {
        distDir: `.next/e2e-${process.env.E2E_NEXT_INSTANCE}`,
        typescript: { tsconfigPath: `.data/e2e-tsconfig-${process.env.E2E_NEXT_INSTANCE}.json` },
      }
    : {}),
  output: 'standalone',
  // `next dev` varsayılan olarak AGENTS.md'ye kendi bloğunu yazar; bu dosya yalnız kullanıcı onaylı
  // kartla değişir (prompts/README.md), bu yüzden kapalı.
  agentRules: false,
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Mezun belgesi yükleme (PDF ≤ 5 MB) bir sunucu eylemidir; Next.js 16 varsayılan gövde sınırı 1 MB'dır.
      // 5 MB dosya + çok parçalı form zarfı için 6 MB (src/contracts/graduation-document.ts MAX_DOCUMENT_BYTES).
      bodySizeLimit: '6mb',
    },
  },
  // Yerel telefon testinde alt gezinmeyi örtmesin; hata katmanı açık kalır.
  devIndicators: false,
  // Sunucu eylemi argümanları ve istek URL’leri günlüğe yazılmaz (src/lib/dev-logging.ts).
  logging: nextLogging,
  async redirects() {
    return [
      {
        source: '/mulakat-sorulari',
        destination: '/mulakat-tuyolari',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/api/:path*', headers: apiHeaders },
      ...INLINE_PDF_SOURCES.map((source) => ({ source, headers: inlinePdfHeaders })),
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);

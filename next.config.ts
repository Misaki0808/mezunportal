import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `next dev` varsayılan olarak AGENTS.md'ye kendi bloğunu yazar; bu dosya yalnız kullanıcı onaylı
  // kartla değişir (prompts/README.md), bu yüzden kapalı.
  agentRules: false,
  reactStrictMode: true,
  // Yerel telefon testinde alt gezinmeyi örtmesin; hata katmanı açık kalır.
  devIndicators: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);

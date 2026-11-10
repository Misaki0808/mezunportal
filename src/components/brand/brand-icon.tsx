import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Uygulama simgesi (favicon, ana ekrana ekle, manifest): yalnız kepli "o" (iris zeminde beyaz "o", lacivert kep, mercan püskül).
 * Çizim `public/brand/mezunportal-simge*.svg` dosyalarıdır; `full` zemini tam kaplar (maskable/Apple simgesi: köşeyi işletim
 * sistemi keser), değilse köşeler yumuşaktır (favicon).
 */
export function BrandIcon({ size, full = false }: { size: number; full?: boolean }) {
  const file = full ? 'mezunportal-simge-tam.svg' : 'mezunportal-simge.svg';
  const svg = readFileSync(join(process.cwd(), 'public', 'brand', file));
  const src = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  // eslint-disable-next-line @next/next/no-img-element -- ImageResponse (Satori) içinde next/image çalışmaz
  return <img src={src} width={size} height={size} alt="" />;
}

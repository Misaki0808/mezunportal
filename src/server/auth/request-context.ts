import 'server-only';

import { headers } from 'next/headers';

/**
 * İstemci adresi: yalnız `X-Forwarded-For`'un İLK değeri (ya da `X-Real-IP`) ve yalnız IP biçimindeyse.
 * Bu başlıklar istemci tarafından taklit EDİLEBİLİR; adres yalnız TAMAMLAYICI hız sınırı anahtarıdır
 * (asıl koruma e-posta/kullanıcı başınadır). Canlıda başlığı güvenilir bir ters vekil yazar (P1-18).
 */
export function clientIpFrom(source: Pick<Headers, 'get'>): string | null {
  const forwarded = source.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || source.get('x-real-ip')?.trim() || null;
  if (!candidate) return null;
  // IPv4 / IPv6 (kaba biçim denetimi; geçersiz değer anahtar olarak kullanılmaz).
  const looksLikeIp = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:]{2,45})$/.test(candidate);
  return looksLikeIp ? candidate : null;
}

export async function getRequestContext(): Promise<{ headers: Headers; clientIp: string | null }> {
  const requestHeaders = await headers();
  return { headers: new Headers(requestHeaders), clientIp: clientIpFrom(requestHeaders) };
}

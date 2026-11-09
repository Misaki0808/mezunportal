import 'server-only';
import encodeQR from 'qr';

/** Kod URL parçasında kalır; sunucu günlüklerine veya Referer başlığına gönderilmez. */
export function campusEventQr(eventId: string, code: string, appUrl: string) {
  const url = new URL('/etkinlik-katilim', appUrl);
  url.hash = new URLSearchParams({ etkinlik: eventId, kod: code }).toString();
  return encodeQR(url.href, 'svg', { border: 4, ecc: 'medium' });
}

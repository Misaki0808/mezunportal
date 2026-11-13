/** Günlükte yalnız kararlı olay adı; alıcı, hata, gövde ve anahtar yok. */
/** `stale`: kuyruktaki içerik gönderim anında bayat çıktı (alıcı, içerik ve sebep yazılmaz; sebep çıkış kutusu satırındadır). */
export type EmailEvent = 'queued' | 'sent' | 'retry' | 'failed' | 'stale';
export type EmailLogger = (event: EmailEvent, recipient: string) => void;
export function maskEmail(address: string): string {
  // Alan adını da gizle: kişisel veya kurumsal alan günlükte kalmasın.
  return address.includes('@') ? '***@***' : '***';
}
export const logEmailEvent: EmailLogger = (event) => {
  process.stdout.write(JSON.stringify({ event: `email.${event}` }) + '\n');
};

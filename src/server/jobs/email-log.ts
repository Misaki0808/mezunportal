/** Günlükte yalnız kararlı olay adı; alıcı, hata, gövde ve anahtar yok. */
export type EmailEvent = 'queued' | 'sent' | 'retry' | 'failed';
export type EmailLogger = (event: EmailEvent, recipient: string) => void;
export function maskEmail(address: string): string {
  // Alan adını da gizle: kişisel veya kurumsal alan günlükte kalmasın.
  return address.includes('@') ? '***@***' : '***';
}
export const logEmailEvent: EmailLogger = (event, _recipient) => {
  process.stdout.write(JSON.stringify({ event: `email.${event}` }) + '\n');
};

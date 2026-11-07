/** Günlüklerde yalnız maskeli alıcı ve kararlı olay adı; ham hata/gövde/anahtar yok. */
export type EmailEvent = 'queued' | 'sent' | 'retry' | 'failed';
export type EmailLogger = (event: EmailEvent, recipient: string) => void;
export function maskEmail(address: string): string {
  // Alan adını da gizle: kişisel veya kurumsal alan günlükte kalmasın.
  return address.includes('@') ? '***@***' : '***';
}
export const logEmailEvent: EmailLogger = (event, recipient) => {
  process.stdout.write(
    JSON.stringify({ event: `email.${event}`, recipient: maskEmail(recipient) }) + '\n',
  );
};

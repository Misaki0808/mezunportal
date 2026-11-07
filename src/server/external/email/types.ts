import { z } from 'zod';

// Hazır metinleri çağıran üretir; taşıma katmanı şablon/render işi yapmaz.
export const emailMessageSchema = z.object({
  to: z.email().max(254),
  subject: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\r\n]+$/),
  text: z.string().min(1).max(100_000),
  html: z.string().max(200_000).optional(),
});
export type EmailMessage = z.infer<typeof emailMessageSchema>;
export type EmailDelivery = EmailMessage & { messageId: string };
export interface EmailTransport {
  send(message: EmailDelivery): Promise<void>;
  close(): void;
}

/** Sağlayıcı yanıtını/adres/gövdeyi asla mesajında taşımaz. */
export class EmailTransportError extends Error {
  constructor(readonly retryable = true) {
    super(retryable ? 'EMAIL_TRANSPORT_UNAVAILABLE' : 'EMAIL_DELIVERY_REJECTED');
    this.name = 'EmailTransportError';
  }
}

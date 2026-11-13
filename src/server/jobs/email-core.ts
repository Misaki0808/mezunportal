import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  emailMessageSchema,
  EmailTransportError,
  type EmailTransport,
} from '../external/email/types';
import { type EmailLogger, logEmailEvent, maskEmail } from './email-log';

export const queuedEmailSchema = emailMessageSchema.extend({
  template: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  idempotencyKey: z.string().min(1).max(200),
  recipientUserId: z.string().min(1).max(200).optional(),
  /**
   * Aylık özette gönderim anı bayatlık denetimi: özetin VERİ parmak izi (`digestFingerprint`; gövde, adres ya da jeton
   * değil). ŞEMADA OLMALI: şemada olmazsa `safeParse` alanı siler ve denetim sessizce eski metin karşılaştırmasına döner.
   * Yoksa (parmak izinden önce kuyruğa alınmış kayıt) eski metin denetimi geçiş dönemi için sürer.
   */
  digestFingerprint: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});
export type QueuedEmail = z.infer<typeof queuedEmailSchema>;

/**
 * Çıkış kutusu satırının `errorCode`'u: İÇ dizge, kullanıcıya dönmez (kullanıcıya dönen hatalar `src/lib/errors.ts`'tedir).
 * `EMAIL_PREFERENCE_DISABLED` yalnız kullanıcı bildirimi gerçekten kapattığında yazılır. Taşıma hataları
 * (`EMAIL_TRANSPORT_UNAVAILABLE`, `EMAIL_DELIVERY_REJECTED`) `EmailTransportError.message`'dan gelir.
 */
export type EmailFailureCode =
  | 'EMAIL_PREFERENCE_DISABLED'
  | 'EMAIL_RECIPIENT_INELIGIBLE'
  | 'DIGEST_STALE'
  | 'JOB_MATCH_STALE'
  | 'APPLICATION_WINDOW_STALE'
  | 'EMAIL_DELIVERY_EXHAUSTED';
/** Gönderim anı kararı. `boolean` eski çağıranlar içindir: `false` = `EMAIL_PREFERENCE_DISABLED`. */
export type SendDecision = { send: true } | { send: false; errorCode: EmailFailureCode };
const STALE_CODES: ReadonlySet<EmailFailureCode> = new Set([
  'DIGEST_STALE',
  'JOB_MATCH_STALE',
  'APPLICATION_WINDOW_STALE',
]);
function toDecision(result: boolean | SendDecision): SendDecision {
  if (result === true) return { send: true };
  if (result === false) return { send: false, errorCode: 'EMAIL_PREFERENCE_DISABLED' };
  return result;
}
export type EmailRecord = { id: string; status: 'QUEUED' | 'SENT' | 'FAILED'; attempts: number };
export interface EmailUnitOfWork {
  find(key: string): Promise<EmailRecord | null>;
  create(input: QueuedEmail): Promise<EmailRecord>;
  publish(id: string, input: QueuedEmail): Promise<void>;
  mark(
    id: string,
    state: {
      status: EmailRecord['status'];
      attempts: number;
      errorCode: string | null;
      sentAt: Date | null;
    },
  ): Promise<void>;
}
export interface EmailOutbox {
  // Kilit aynı idempotency anahtarı için enqueue ve worker yarışlarını da sıralar.
  withKey<T>(key: string, run: (work: EmailUnitOfWork) => Promise<T>): Promise<T>;
}
export function emailMessageId(key: string): string {
  return `<${createHash('sha256').update(key).digest('hex')}@mezunportal.local>`;
}

export function createEmailService(
  outbox: EmailOutbox,
  transport: EmailTransport,
  logger: EmailLogger = logEmailEvent,
  maySend: (message: QueuedEmail) => Promise<boolean | SendDecision> = async () => true,
) {
  return {
    async enqueueEmail(input: QueuedEmail): Promise<{ emailLogId: string | null }> {
      // Ham Zod hatası kullanıcıya/loga taşınmaz (taşıma yardımcısı yalnız sunucu içindir).
      const parsed = queuedEmailSchema.safeParse(input);
      if (!parsed.success) throw new Error('EMAIL_INPUT_INVALID');
      const decision = toDecision(await maySend(parsed.data));
      if (!decision.send) {
        if (STALE_CODES.has(decision.errorCode)) logger('stale', maskEmail(parsed.data.to));
        return { emailLogId: null };
      }
      return outbox.withKey(parsed.data.idempotencyKey, async (work) => {
        const existing = await work.find(parsed.data.idempotencyKey);
        if (existing) return { emailLogId: existing.id };
        const row = await work.create(parsed.data);
        await work.publish(row.id, parsed.data);
        logger('queued', maskEmail(parsed.data.to));
        return { emailLogId: row.id };
      });
    },
    async markExhausted(input: QueuedEmail): Promise<void> {
      const parsed = queuedEmailSchema.safeParse(input);
      if (!parsed.success) throw new EmailTransportError(false);
      await outbox.withKey(parsed.data.idempotencyKey, async (work) => {
        const row = await work.find(parsed.data.idempotencyKey);
        if (!row || row.status !== 'QUEUED') return;
        await work.mark(row.id, {
          status: 'FAILED',
          attempts: row.attempts,
          errorCode: 'EMAIL_DELIVERY_EXHAUSTED',
          sentAt: null,
        });
        logger('failed', maskEmail(parsed.data.to));
      });
    },
    async deliver(input: QueuedEmail, retryCount: number, retryLimit: number): Promise<void> {
      const parsed = queuedEmailSchema.safeParse(input);
      if (!parsed.success) throw new EmailTransportError(false);
      const message = parsed.data;
      const outcome = await outbox.withKey(message.idempotencyKey, async (work) => {
        const row = await work.find(message.idempotencyKey);
        if (!row) throw new Error('EMAIL_LOG_MISSING');
        if (row.status !== 'QUEUED') return null;
        const decision = toDecision(await maySend(message));
        if (!decision.send) {
          await work.mark(row.id, {
            status: 'FAILED',
            attempts: row.attempts,
            errorCode: decision.errorCode,
            sentAt: null,
          });
          if (STALE_CODES.has(decision.errorCode)) logger('stale', maskEmail(message.to));
          return null;
        }
        const attempts = row.attempts + 1;
        try {
          await transport.send({
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
            messageId: emailMessageId(message.idempotencyKey),
          });
        } catch (cause) {
          const error = cause instanceof EmailTransportError ? cause : new EmailTransportError();
          const final = !error.retryable || retryCount >= retryLimit;
          await work.mark(row.id, {
            status: final ? 'FAILED' : 'QUEUED',
            attempts,
            errorCode: error.message,
            sentAt: null,
          });
          logger(final ? 'failed' : 'retry', maskEmail(message.to));
          return error;
        }
        await work.mark(row.id, { status: 'SENT', attempts, errorCode: null, sentAt: new Date() });
        logger('sent', maskEmail(message.to));
        return null;
      });
      // Durum işlemi commit olduktan sonra pg-boss'a yalnız kararlı hata verilir.
      if (outcome) throw outcome;
    },
  };
}

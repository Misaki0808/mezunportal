import 'server-only';
import nodemailer from 'nodemailer';
import { EnvValidationError, type Env } from '@/lib/env';
import { emailMessageSchema, EmailTransportError, type EmailTransport } from './types';

export function smtpSettings(env: Env) {
  const missing = (['SMTP_HOST', 'SMTP_PORT', 'EMAIL_FROM'] as const).filter((key) => !env[key]);
  if (missing.length) throw new EnvValidationError(missing);
  // Yerel ortam gerçek SMTP'ye/adrese gönderemez: yalnız ortak Mailpit servisi.
  if (
    env.APP_ENV !== 'prod' &&
    (!['127.0.0.1', 'localhost'].includes(env.SMTP_HOST ?? '') || env.SMTP_PORT !== 1025)
  ) {
    throw new EnvValidationError(['SMTP_HOST', 'SMTP_PORT']);
  }
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
    throw new EnvValidationError(['SMTP_USER', 'SMTP_PASSWORD']);
  }
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    from: env.EMAIL_FROM,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.APP_ENV === 'prod' && env.SMTP_PORT !== 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    logger: false as const,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export function createSmtpTransport(env: Env): EmailTransport {
  const { from, ...options } = smtpSettings(env);
  const transport = nodemailer.createTransport(options);
  return {
    async send(message) {
      try {
        const valid = emailMessageSchema.parse(message);
        const result = await transport.sendMail({
          ...valid,
          from,
          messageId: message.messageId,
          envelope: { from: from ?? '', to: [valid.to] },
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        if (result.rejected.length || !result.accepted.length) throw new EmailTransportError(false);
      } catch (error) {
        if (error instanceof EmailTransportError) throw error;
        const responseCode =
          typeof error === 'object' && error !== null && 'responseCode' in error
            ? Number(error.responseCode)
            : 0;
        throw new EmailTransportError(!(responseCode >= 500 && responseCode < 600));
      }
    },
    close() {
      transport.close();
    },
  };
}

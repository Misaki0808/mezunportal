import 'server-only';

import { createHash } from 'node:crypto';

import { createTranslator } from 'next-intl';

import messages from '../../../messages/tr.json';

/**
 * Kimlik doğrulama e-postaları. Gönderim R2'nin `enqueueEmail`'ine (kart 022) bağlanır: bu dosya yalnız
 * İÇERİĞİ (messages/tr.json `emails.*`) ve IDEMPOTANS ANAHTARINI üretir, kuyruğa verir. Bağlantılar (jeton
 * içerir) loglanmaz ve EmailLog'a yazılmaz — kuyruk gövdeyi saklamaz (docs/data.md).
 */
export type EnqueueEmail = (input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  template: string;
  idempotencyKey: string;
  recipientUserId?: string | null;
}) => Promise<{ emailLogId: string }>;

export type AuthEmailPort = {
  sendSignInLink(input: { to: string; url: string; token: string }): Promise<void>;
  /** Eski adrese: değişikliği onaylama bağlantısı. */
  sendChangeEmailConfirmation(input: {
    to: string;
    newEmail: string;
    url: string;
    token: string;
    userId: string;
  }): Promise<void>;
  /** Yeni adrese: doğrulama bağlantısı. */
  sendChangeEmailVerification(input: {
    to: string;
    url: string;
    token: string;
    userId: string;
  }): Promise<void>;
  sendGraduationDocumentDecision(input: {
    to: string;
    userId: string;
    documentId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason?: string;
  }): Promise<void>;
};

/** Giriş bağlantısı geçerlilik süresi (dk); `config.ts` aynı sabiti magic-link `expiresIn`e verir. */
export const SIGN_IN_LINK_MINUTES = 10;

const t = createTranslator({ locale: 'tr', messages, namespace: 'emails' });

/** İş anahtarından (jeton/belge kimliği) türetilen, jetonu açığa çıkarmayan idempotans anahtarı. */
export function idempotencyKeyFor(kind: string, businessKey: string): string {
  return `${kind}:${createHash('sha256').update(businessKey).digest('hex').slice(0, 40)}`;
}

export function createAuthEmailPort(enqueue: EnqueueEmail): AuthEmailPort {
  return {
    async sendSignInLink({ to, url, token }) {
      await enqueue({
        to,
        subject: t('signInLink.subject'),
        text: t('signInLink.text', { url, minutes: SIGN_IN_LINK_MINUTES }),
        template: 'auth.sign-in-link',
        idempotencyKey: idempotencyKeyFor('auth.sign-in-link', token),
      });
    },
    async sendChangeEmailConfirmation({ to, newEmail, url, token, userId }) {
      await enqueue({
        to,
        subject: t('changeEmailConfirmation.subject'),
        text: t('changeEmailConfirmation.text', { url, newEmail }),
        template: 'auth.change-email-confirmation',
        idempotencyKey: idempotencyKeyFor('auth.change-email-confirmation', token),
        recipientUserId: userId,
      });
    },
    async sendChangeEmailVerification({ to, url, token, userId }) {
      await enqueue({
        to,
        subject: t('changeEmailVerification.subject'),
        text: t('changeEmailVerification.text', { url }),
        template: 'auth.change-email-verification',
        idempotencyKey: idempotencyKeyFor('auth.change-email-verification', token),
        recipientUserId: userId,
      });
    },
    async sendGraduationDocumentDecision({ to, userId, documentId, decision, reason }) {
      const approved = decision === 'APPROVED';
      await enqueue({
        to,
        subject: approved ? t('documentApproved.subject') : t('documentRejected.subject'),
        text: approved
          ? t('documentApproved.text')
          : t('documentRejected.text', { reason: reason ?? '' }),
        template: approved ? 'graduation-document.approved' : 'graduation-document.rejected',
        // İş anahtarı belge kimliği: aynı karar e-postası ikinci kez kuyruğa girmez.
        idempotencyKey: idempotencyKeyFor(`graduation-document.${decision}`, documentId),
        recipientUserId: userId,
      });
    },
  };
}

/**
 * R2'nin kuyruğu birleşene kadar varsayılan: e-posta yapılandırılmamış. Çağrı hata verir; çağıranlar
 * (giriş bağlantısı) hatayı yutup nötr yanıt döner, belge kararı e-postası ise karar sonrası yutulur.
 */
export const notConfiguredEnqueue: EnqueueEmail = async () => {
  throw new Error('E-posta kuyruğu henüz bağlanmadı');
};

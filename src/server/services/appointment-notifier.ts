import 'server-only';

import { createHash } from 'node:crypto';

import { createTranslator } from 'next-intl';

import messages from '../../../messages/tr.json';

/**
 * Randevu bildirimleri (e-posta). Bu dosya İÇERİĞİ (`messages/tr.json` `emails.appointment.*`) ve IDEMPOTANS ANAHTARINI
 * üretir, kuyruğa verir (`enqueueEmail`). Bildirim, durum değişikliği commit olduktan SONRA ve en iyi gayretle gönderilir:
 * e-posta hatası randevu durumunu geri almaz. Aynı olay iki kez gönderilmez (anahtar: olay + randevu + alıcı).
 * Karşı tarafın e-posta adresi içeriğe girmez (adres yalnız takvim davetinde paylaşılır).
 */
export type AppointmentEvent =
  | 'requested'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'reminder'
  | 'linkNeeded'
  | 'linkAdded';

export type AppointmentNotice = {
  event: AppointmentEvent;
  appointmentId: string;
  recipient: { userId: string; email: string };
  /** Karşı tarafın görünen adı. */
  counterpartName: string;
  startsAt: Date;
  mode: 'ONLINE' | 'IN_PERSON';
  /** `requested`: yanıt son tarihi. */
  expiresAt?: Date | null;
  meetUrl?: string | null;
  location?: string | null;
  reason?: string | null;
  /** `confirmed`: onay 24 saatten kısa süre kala geldiyse hatırlatma onayla birlikte gider. */
  withReminder?: boolean;
};

export type EnqueueEmail = (input: {
  to: string;
  subject: string;
  text: string;
  template: string;
  idempotencyKey: string;
  recipientUserId?: string;
}) => Promise<unknown>;

export interface AppointmentNotifier {
  notify(notice: AppointmentNotice): Promise<void>;
}

const t = createTranslator({ locale: 'tr', messages, namespace: 'emails.appointment' });

const formatWhen = (date: Date) =>
  new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);

function detailsOf(notice: AppointmentNotice): string {
  if (notice.mode === 'ONLINE' && notice.meetUrl) return t('detailsLink', { url: notice.meetUrl });
  if (notice.mode === 'IN_PERSON' && notice.location)
    return t('detailsPlace', { place: notice.location });
  return '';
}

export function buildAppointmentEmail(notice: AppointmentNotice): {
  subject: string;
  text: string;
  template: string;
  idempotencyKey: string;
} {
  const common = {
    name: notice.counterpartName,
    when: formatWhen(notice.startsAt),
    mode: notice.mode === 'ONLINE' ? t('modeOnline') : t('modeInPerson'),
  };
  const reason = notice.reason ? t('reasonLine', { reason: notice.reason }) : '';
  let text: string;
  switch (notice.event) {
    case 'requested':
      text = t('requested.text', {
        ...common,
        deadline: notice.expiresAt ? formatWhen(notice.expiresAt) : '',
      });
      break;
    case 'confirmed':
      text = t('confirmed.text', {
        ...common,
        details: detailsOf(notice),
        reminder: notice.withReminder ? t('reminderLine') : '',
      });
      break;
    case 'declined':
      text = t('declined.text', { ...common, reason });
      break;
    case 'cancelled':
      text = t('cancelled.text', { ...common, reason });
      break;
    case 'expired':
      text = t('expired.text', common);
      break;
    case 'reminder':
      text = t('reminder.text', { ...common, details: detailsOf(notice) });
      break;
    case 'linkNeeded':
      text = t('linkNeeded.text', common);
      break;
    case 'linkAdded':
      text = t('linkAdded.text', { ...common, url: notice.meetUrl ?? '' });
      break;
  }
  const digest = createHash('sha256')
    .update(`${notice.event}:${notice.appointmentId}:${notice.recipient.userId}`)
    .digest('hex')
    .slice(0, 40);
  return {
    subject: t(`${notice.event}.subject`),
    text,
    template: `appointment.${notice.event}`,
    idempotencyKey: `appointment.${notice.event}:${digest}`,
  };
}

export function createAppointmentNotifier(enqueue: EnqueueEmail): AppointmentNotifier {
  return {
    async notify(notice) {
      const email = buildAppointmentEmail(notice);
      await enqueue({
        to: notice.recipient.email,
        subject: email.subject,
        text: email.text,
        template: email.template,
        idempotencyKey: email.idempotencyKey,
        recipientUserId: notice.recipient.userId,
      });
    },
  };
}

/** Testlerde bildirimleri toplar. */
export function createRecordingNotifier(): AppointmentNotifier & {
  readonly notices: AppointmentNotice[];
} {
  const notices: AppointmentNotice[] = [];
  return {
    notices,
    async notify(notice) {
      notices.push(notice);
    },
  };
}

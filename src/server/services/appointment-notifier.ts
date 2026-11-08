import 'server-only';

import { createHash } from 'node:crypto';

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

const catalog = messages.emails.appointment;
/** Bu e-posta kataloğu yalnız adlandırılmış düz metin alanları taşır; React/Next çalışma zamanı istemez. */
const formatText = (template: string, values: Record<string, string> = {}) =>
  template.replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);

const formatWhen = (date: Date) =>
  new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);

function detailsOf(notice: AppointmentNotice): string {
  if (notice.mode === 'ONLINE' && notice.meetUrl)
    return formatText(catalog.detailsLink, { url: notice.meetUrl });
  if (notice.mode === 'IN_PERSON' && notice.location)
    return formatText(catalog.detailsPlace, { place: notice.location });
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
    mode:
      notice.mode === 'ONLINE' ? formatText(catalog.modeOnline) : formatText(catalog.modeInPerson),
  };
  const reason = notice.reason ? formatText(catalog.reasonLine, { reason: notice.reason }) : '';
  let text: string;
  switch (notice.event) {
    case 'requested':
      text = formatText(catalog.requested.text, {
        ...common,
        deadline: notice.expiresAt ? formatWhen(notice.expiresAt) : '',
      });
      break;
    case 'confirmed':
      text = formatText(catalog.confirmed.text, {
        ...common,
        details: detailsOf(notice),
        reminder: notice.withReminder ? formatText(catalog.reminderLine) : '',
      });
      break;
    case 'declined':
      text = formatText(catalog.declined.text, { ...common, reason });
      break;
    case 'cancelled':
      text = formatText(catalog.cancelled.text, { ...common, reason });
      break;
    case 'expired':
      text = formatText(catalog.expired.text, common);
      break;
    case 'reminder':
      text = formatText(catalog.reminder.text, { ...common, details: detailsOf(notice) });
      break;
    case 'linkNeeded':
      text = formatText(catalog.linkNeeded.text, common);
      break;
    case 'linkAdded':
      text = formatText(catalog.linkAdded.text, { ...common, url: notice.meetUrl ?? '' });
      break;
  }
  const digest = createHash('sha256')
    .update(`${notice.event}:${notice.appointmentId}:${notice.recipient.userId}`)
    .digest('hex')
    .slice(0, 40);
  return {
    subject: catalog[notice.event].subject,
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

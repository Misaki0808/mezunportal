// @vitest-environment jsdom
import { expect, it } from 'vitest';
import messages from '../../../messages/tr.json';
import { createAuthEmailPort } from '@/server/auth/email-port';
import {
  buildAppointmentEmail,
  type AppointmentEvent,
} from '@/server/services/appointment-notifier';
import { decorateEmail, preheaderOf } from './email-presentation';
import { notificationCopy } from './notification-copy';
import type { QueuedEmail } from './email-core';

const app = 'https://portal.invalid';
const attacks = [
  '<script>alert(1)</script>',
  '\"><img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  'https://evil.invalid/a',
  'https://portal.invalid.evil.invalid/a',
  'https://portal.invalid@evil.invalid/a',
  '//evil.invalid/a',
  'https://evil.invalid/?next=https://portal.invalid/fake',
  'https://portal.invalid/ok?x=\" onmouseover=\"alert(1)',
  'https://portal.invalid/ok#\" onclick=\"alert(1)',
  'https://portal.invalid\\@evil.invalid/a',
  '<svg/onload=alert(1)> & <iframe src=//evil.invalid>',
];

it.each(attacks)('kullanıcı alanı HTML/bağlantı sınırını aşamaz: %s', (attack) => {
  const text = `Ad: ${attack}\nŞirket: ${attack}\nİlan: ${attack}\nMesaj: ${attack}`;
  const result = decorateEmail(
    {
      to: 'test@example.invalid',
      subject: 'Örnek',
      template: 'contact.requested',
      idempotencyKey: 'security-probe',
      text,
      html: '<img src="https://evil.invalid/pixel">',
    },
    app,
  );
  const document = new DOMParser().parseFromString(result.html!, 'text/html');
  expect(
    document.querySelectorAll(
      'script,img,iframe,object,embed,[onclick],[onload],[onmouseover],[onerror]',
    ),
  ).toHaveLength(0);
  expect(document.querySelectorAll('a.email-button')).toHaveLength(1);
  for (const link of document.querySelectorAll('a[href]'))
    expect(new URL(link.getAttribute('href')!, app).origin).toBe(app);
  expect(document.querySelector('style')?.textContent).not.toMatch(/url\(|@import/i);
  expect(result.text).toBe(`${text}\n\nBildirim tercihlerin: ${app}/hesap/bildirimler`);
});

it('gerçek randevu onayı ve hatırlatma düğmesi randevulara gider, değerlendirme geçmişine değil', () => {
  for (const event of ['confirmed', 'reminder'] as const) {
    const notice = buildAppointmentEmail({
      event,
      appointmentId: 'appointment',
      recipient: { userId: 'recipient', email: 'test@example.invalid' },
      counterpartName: '\"><img src=x onerror=alert(1)>',
      startsAt: new Date('2030-01-01T09:00:00Z'),
      mode: 'ONLINE',
      meetUrl: 'https://meet.example.invalid/room',
    });
    const result = decorateEmail({ ...notice, to: 'test@example.invalid' }, app);
    const document = new DOMParser().parseFromString(result.html!, 'text/html');
    expect(document.querySelector('a.email-button')?.getAttribute('href')).toBe(
      `${app}/randevular`,
    );
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(
      [...document.querySelectorAll('a')].some((a) => a.href.includes('meet.example.invalid')),
    ).toBe(false);
  }
});

// ---- Kilit ekranı politikası (kart 300): ön izleme (preheader) kişi adı, e-posta adresi, işveren adı ve gerekçe/not/mesaj
// taşımaz; bunlar gövdede kalır. Konu satırında "reddedildi" yazılmamasıyla aynı gerekçe: kilit ekranında bağlamsız görünmesin.
const secret = {
  name: 'KARSITARAF-ADI',
  email: 'yeni.adres@example.invalid',
  company: 'ISVEREN-ADI',
  reason: 'GEREKCE-METNI',
  note: 'NOT-METNI',
  place: 'YER-METNI',
};
const secretValues = Object.values(secret);
const previewOf = (message: QueuedEmail) => {
  const result = decorateEmail(message, app);
  const document = new DOMParser().parseFromString(result.html!, 'text/html');
  return document.querySelector('.email-preheader')!.textContent!.replace(/[‌ ]/g, '');
};
const expectNoSecret = (preview: string, label: string) => {
  for (const value of secretValues) expect(preview, `${label}: ${value}`).not.toContain(value);
  expect(preview, `${label}: e-posta adresi`).not.toMatch(/\S+@\S+/);
};

it.each([
  'requested',
  'confirmed',
  'declined',
  'cancelled',
  'expired',
  'reminder',
  'linkNeeded',
  'linkAdded',
] as AppointmentEvent[])(
  'randevu e-postası (%s): ön izleme karşı tarafın adını, saati ve gerekçeyi taşımaz',
  (event) => {
    const notice = buildAppointmentEmail({
      event,
      appointmentId: 'appointment',
      recipient: { userId: 'recipient', email: 'test@example.invalid' },
      counterpartName: secret.name,
      startsAt: new Date('2030-01-01T09:00:00Z'),
      mode: 'IN_PERSON',
      expiresAt: new Date('2029-12-30T09:00:00Z'),
      location: secret.place,
      reason: secret.reason,
    });
    // Ad ve gerekçe gövdede KALIR (politika yalnız ön izlemeyi kapsar).
    expect(notice.text).toContain(secret.name);
    const preview = previewOf({ ...notice, to: 'test@example.invalid' });
    expectNoSecret(preview, event);
    expect(preview).toBe(messages.notifications.email.preheaderAppointment);
  },
);

it('e-posta değişikliği onayı: ön izleme yeni adresi taşımaz, gövde taşır', () => {
  const sent: QueuedEmail[] = [];
  const port = createAuthEmailPort(async (input) => {
    sent.push(input as QueuedEmail);
    return { emailLogId: null };
  });
  return port
    .sendChangeEmailConfirmation({
      to: 'eski@example.invalid',
      newEmail: secret.email,
      url: `${app}/onay`,
      token: 't',
      userId: 'u',
    })
    .then(() => {
      expect(sent[0]!.text).toContain(secret.email);
      const preview = previewOf(sent[0]!);
      expectNoSecret(preview, 'change-email');
      expect(preview).toBe(messages.notifications.email.preheaderChangeEmail);
    });
});

it('belge reddi: ön izleme gerekçeyi taşımaz; konu "onaylanamadı" demez', async () => {
  const sent: QueuedEmail[] = [];
  const port = createAuthEmailPort(async (input) => {
    sent.push(input as QueuedEmail);
    return { emailLogId: null };
  });
  await port.sendGraduationDocumentDecision({
    to: 'a@example.invalid',
    userId: 'u',
    documentId: 'd',
    decision: 'REJECTED',
    reason: secret.reason,
  });
  expect(sent[0]!.text).toContain(secret.reason);
  expectNoSecret(previewOf(sent[0]!), 'belge reddi');
  // Diğer ret konularıyla ("…incelendi") tutarlı: kilit ekranında olumsuz sonuç yazmaz.
  expect(sent[0]!.subject).toBe('Mezun belgen incelendi');
  expect(sent[0]!.subject).not.toMatch(/onaylanamad|reddedil/i);
});

it('"hâlâ çalışıyor musun": ön izleme işveren adını taşımaz, gövde taşır', () => {
  const message: QueuedEmail = {
    to: 'a@example.invalid',
    template: 'alumni.still-there',
    idempotencyKey: 'k',
    subject: messages.notifications.email.stillThereSubject,
    text: notificationCopy('stillThereText', {
      company: secret.company,
      yesUrl: `${app}/bildirim-yanit#token=a&choice=YES`,
      noUrl: `${app}/bildirim-yanit#token=b&choice=NO`,
    }),
  };
  expect(message.text).toContain(secret.company);
  const preview = previewOf(message);
  expectNoSecret(preview, 'still-there');
  expect(preview).toBe(messages.notifications.email.preheaderStillThere);
});

it('savunma: başka bir şablonun ilk cümlesinde e-posta adresi çıkarsa ön izleme genel cümleye düşer', () => {
  const preview = previewOf({
    to: 'a@example.invalid',
    template: 'cv.review.requested',
    idempotencyKey: 'k',
    subject: 'Örnek',
    text: `Merhaba,\n\n${secret.email} adresinden bir CV inceleme talebi geldi.\n\n${app}/hesap`,
  });
  expect(preview).toBe(messages.notifications.email.preheaderGeneric);
});

// Tamlık denetimi: katalogdaki HER e-posta metni için, yer tutucular işaretçiyle doldurulup ham ön izleme (politika öncesi)
// hesaplanır. İlk cümlesine yer tutucu sızan şablon ya politikada olmalı ya da bu test kırılır (yeni şablon sessizce sızdırmasın).
const POLICY_COVERED = new Set([
  'emails.changeEmailConfirmation.text',
  ...[
    'requested',
    'confirmed',
    'declined',
    'cancelled',
    'expired',
    'reminder',
    'linkNeeded',
    'linkAdded',
  ].map((event) => `emails.appointment.${event}.text`),
  'notifications.email.stillThereText',
]);
function emailTemplates() {
  const found: Array<{ path: string; text: string }> = [];
  const walk = (node: unknown, path: string[]) => {
    if (typeof node === 'string') {
      const key = path.at(-1) ?? '';
      const full = path.join('.');
      if (
        /^(text)$|(Text|Body|Intro)$/.test(key) &&
        /mail|notif|invit|feedback|monthlyDigest/i.test(full)
      )
        found.push({ path: full, text: node });
      return;
    }
    if (node && typeof node === 'object')
      for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
  };
  walk(messages, []);
  return found;
}
it('tamlık: ham ön izlemesine yer tutucu sızan her e-posta metni kilit ekranı politikasında kayıtlıdır', () => {
  const leaking: string[] = [];
  const templates = emailTemplates();
  expect(templates.length).toBeGreaterThan(30);
  for (const { path, text } of templates) {
    const filled = text.replace(/\{(\w+)\}/g, (_m, name: string) =>
      /url$/i.test(name) ? `${app}/x` : `«${name}»`,
    );
    if (preheaderOf(filled).includes('«')) leaking.push(path);
  }
  expect(leaking.sort()).toEqual([...POLICY_COVERED].sort());
});

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

it('belge kararı e-postasının düğmesi: onay başlangıca, ret durum sayfasına gider (araya durum sayfası girmez)', async () => {
  const button = async (decision: 'APPROVED' | 'REJECTED') => {
    const sent: QueuedEmail[] = [];
    await createAuthEmailPort(async (input) => {
      sent.push(input as QueuedEmail);
      return { emailLogId: null };
    }).sendGraduationDocumentDecision({
      to: 'a@example.invalid',
      userId: 'u',
      documentId: 'd',
      decision,
      ...(decision === 'REJECTED' ? { reason: secret.reason } : {}),
    });
    const document = new DOMParser().parseFromString(
      decorateEmail(sent[0]!, app).html!,
      'text/html',
    );
    const link = document.querySelector('a.email-button');
    return { href: link?.getAttribute('href'), label: link?.textContent?.trim() };
  };
  expect(await button('APPROVED')).toEqual({
    href: `${app}/baslangic`,
    label: messages.notifications.email.ctaGraduationApproved,
  });
  expect(await button('REJECTED')).toEqual({
    href: `${app}/dogrulama`,
    label: messages.notifications.email.ctaGraduation,
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

// ---- Ret sonucu önizlemede yok (PM kararı, kart 305): konu satırında "reddedildi" yazılmadığı gibi ön izleme de sonucu söylemez;
// nötr "incelendi; ayrıntılar e-postada" der, sonuç gövdede kalır.
const RESULT_WORDS =
  /yayınlanmad|yayınlanamad|onaylanamad|reddedil|kabul edilemed|kabul edilmed|uygun görülmed|herkese açık bir soru olmadığı|yayınlandı|onaylandı|eklendi|yayımlandı|kabul edildi|yönlendirildi/i;
const url = `${app}/hesap`;
const REJECTIONS: Array<{
  template: string;
  /** Katalogdaki ham metnin yolu (içerik tabanlı tamlık denetimi için). */
  textPath: string;
  preview: string;
  body: RegExp;
  message: () => Promise<QueuedEmail> | QueuedEmail;
}> = [
  {
    template: 'experience.moderation-approved',
    textPath: 'notifications.email.moderationApprovedText',
    preview: messages.notifications.email.preheaderReviewedExperience,
    body: /yayınlandı/,
    message: () => ({
      to: 'a@example.invalid',
      template: 'experience.moderation-approved',
      idempotencyKey: 'ka1',
      subject: messages.notifications.email.moderationApprovedSubject,
      text: notificationCopy('moderationApprovedText', { url }),
    }),
  },
  {
    template: 'faq.published',
    textPath: 'notifications.email.faqPublishedText',
    preview: messages.notifications.email.preheaderReviewedFaq,
    body: /eklendi/,
    message: () => ({
      to: 'a@example.invalid',
      template: 'faq.published',
      idempotencyKey: 'ka2',
      subject: messages.notifications.email.faqPublishedSubject,
      text: notificationCopy('faqPublishedText', { url }),
    }),
  },
  {
    template: 'jobPosting.published',
    textPath: 'notifications.email.jobPostingPublishedText',
    preview: messages.notifications.email.preheaderReviewedJobPosting,
    body: /yayınlandı/,
    message: () => ({
      to: 'a@example.invalid',
      template: 'jobPosting.published',
      idempotencyKey: 'ka3',
      subject: messages.notifications.email.jobPostingPublishedSubject,
      text: notificationCopy('jobPostingPublishedText', { url }),
    }),
  },
  {
    template: 'graduation-document.approved',
    textPath: 'emails.documentApproved.text',
    preview: messages.notifications.email.preheaderReviewedDocument,
    body: /onaylandı/,
    message: async () => {
      const sent: QueuedEmail[] = [];
      await createAuthEmailPort(async (input) => {
        sent.push(input as QueuedEmail);
        return { emailLogId: null };
      }).sendGraduationDocumentDecision({
        to: 'a@example.invalid',
        userId: 'u',
        documentId: 'd-ok',
        decision: 'APPROVED',
      });
      return sent[0]!;
    },
  },
  {
    template: 'experience.moderation-rejected',
    textPath: 'notifications.email.moderationRejectedText',
    preview: messages.notifications.email.preheaderReviewedExperience,
    body: /Gerekçeyi görmek/,
    message: () => ({
      to: 'a@example.invalid',
      template: 'experience.moderation-rejected',
      idempotencyKey: 'k1',
      subject: messages.notifications.email.moderationRejectedSubject,
      text: notificationCopy('moderationRejectedText', { url }),
    }),
  },
  {
    template: 'faq.rejected',
    textPath: 'notifications.email.faqRejectedText',
    preview: messages.notifications.email.preheaderReviewedFaq,
    body: /yayınlanmadı/,
    message: () => ({
      to: 'a@example.invalid',
      template: 'faq.rejected',
      idempotencyKey: 'k2',
      subject: messages.notifications.email.faqRejectedSubject,
      text: notificationCopy('faqRejectedText', { url }),
    }),
  },
  {
    template: 'faq.redirected',
    textPath: 'notifications.email.faqRedirectedText',
    preview: messages.notifications.email.preheaderReviewedFaq,
    body: /mentorla görüşmeni öneriyoruz/,
    message: () => ({
      to: 'a@example.invalid',
      template: 'faq.redirected',
      idempotencyKey: 'k3',
      subject: messages.notifications.email.faqRedirectedSubject,
      text: notificationCopy('faqRedirectedText', { url }),
    }),
  },
  {
    template: 'jobPosting.rejected',
    textPath: 'notifications.email.jobPostingRejectedText',
    preview: messages.notifications.email.preheaderReviewedJobPosting,
    body: /yayınlanmadı/,
    message: () => ({
      to: 'a@example.invalid',
      template: 'jobPosting.rejected',
      idempotencyKey: 'k4',
      subject: messages.notifications.email.jobPostingRejectedSubject,
      text: notificationCopy('jobPostingRejectedText', { url }),
    }),
  },
  {
    template: 'graduation-document.rejected',
    textPath: 'emails.documentRejected.text',
    preview: messages.notifications.email.preheaderReviewedDocument,
    body: /onaylanamadı/,
    message: async () => {
      const sent: QueuedEmail[] = [];
      await createAuthEmailPort(async (input) => {
        sent.push(input as QueuedEmail);
        return { emailLogId: null };
      }).sendGraduationDocumentDecision({
        to: 'a@example.invalid',
        userId: 'u',
        documentId: 'd',
        decision: 'REJECTED',
        reason: secret.reason,
      });
      return sent[0]!;
    },
  },
];

it.each(REJECTIONS)(
  'inceleme sonucu e-postası ($template, onay da ret de): ön izleme ve konu sonucu söylemez, nötr cümledir; sonuç gövdede kalır',
  async ({ preview: expected, body, message }) => {
    const built = await message();
    // Sonuç yalnız gövdede (ret cümlesi ya da gerekçe bağlantısı).
    expect(built.text).toMatch(body);
    const preview = previewOf(built);
    expect(preview).toBe(expected);
    expect(preview).not.toMatch(RESULT_WORDS);
    expect(preview).toContain('incelendi');
    // Konu satırı da sonucu söylemez (kilit ekranında bildirim başlığı).
    expect(built.subject).not.toMatch(RESULT_WORDS);
    expect(built.subject).toContain('incelendi');
  },
);

it('randevu reddi (declined) zaten genel cümledir: sonuç sözcüğü yok', () => {
  const notice = buildAppointmentEmail({
    event: 'declined',
    appointmentId: 'appointment',
    recipient: { userId: 'recipient', email: 'test@example.invalid' },
    counterpartName: secret.name,
    startsAt: new Date('2030-01-01T09:00:00Z'),
    mode: 'ONLINE',
    reason: secret.reason,
  });
  expect(notice.text).toMatch(/kabul edemedi/);
  expect(previewOf({ ...notice, to: 'test@example.invalid' })).not.toMatch(RESULT_WORDS);
});

// Tamlık (içerik tabanlı, kart 316 / R1 312 notu): şablonun ADINA bakılmaz; katalogdaki her e-posta metninin ham ön izlemesine
// (ilk cümle) bakılır. Sonuç sözcüğü taşıyan her metin ya yukarıdaki nötr cümleye bağlı olmalı (REJECTIONS) ya da burada gerekçesiyle
// "bilerek serbest" yazılmalı. Yeni bir şablon (adı ne olursa olsun) ilk cümlesinde "yayınlandı/onaylandı/reddedildi…" derse test kırılır.
const RESULT_PREVIEW_ON_PURPOSE: Record<string, string> = {
  // PM kararı (kart 316): randevu e-postası "Randevun onaylandı" gizli değil, kullanıcıya işe yarar; karşı taraf adı ön izlemede zaten yok.
  'emails.appointment.confirmed.text': 'randevu onayı',
  // Karar değil, işlem bildirimi (bağlantı eklendi); sonuç ya da gerekçe taşımaz.
  'emails.appointment.linkAdded.text': 'bağlantı eklendi',
};
it('tamlık (içerik tabanlı): ham ön izlemesi sonuç sözcüğü taşıyan her e-posta metni nötr cümleye bağlıdır ya da bilerek serbesttir', () => {
  const templates = emailTemplates();
  const neutral = new Set(REJECTIONS.map((r) => r.textPath));
  const revealing = templates
    .filter(({ text }) => {
      const filled = text.replace(/\{(\w+)\}/g, (_m, name: string) =>
        /url$/i.test(name) ? `${app}/x` : `«${name}»`,
      );
      return RESULT_WORDS.test(preheaderOf(filled));
    })
    .map(({ path }) => path);
  const uncovered = revealing.filter(
    (path) => !neutral.has(path) && !(path in RESULT_PREVIEW_ON_PURPOSE),
  );
  expect(uncovered, 'sonucu ön izlemede söyleyen ve kayıtsız şablon').toEqual([]);
  // Listeler bayatlamasın: kayıtlı her yol katalogda var; "bilerek serbest" her yol gerçekten sonuç söylüyor.
  const catalog = new Set(templates.map(({ path }) => path));
  for (const path of [...neutral, ...Object.keys(RESULT_PREVIEW_ON_PURPOSE)])
    expect(catalog.has(path), `katalogda yok: ${path}`).toBe(true);
  for (const path of Object.keys(RESULT_PREVIEW_ON_PURPOSE))
    expect(revealing, `artık sonuç söylemiyor, listeden çıkar: ${path}`).toContain(path);
  // Her nötr şablonun gerçek ön izlemesi yukarıdaki it.each ile ayrıca denetlenir; burada sayı çıpalanır.
  expect(REJECTIONS).toHaveLength(9);
});

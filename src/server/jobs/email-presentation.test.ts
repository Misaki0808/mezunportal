import { describe, expect, it } from 'vitest';
import { decorateEmail } from './email-presentation';
describe('e-posta sunumu', () => {
  it('gövdeyi HTML olarak kaçışlar, yalnız uygulama bağlantılarını tıklanabilir yapar', () => {
    const result = decorateEmail(
      {
        to: 'test@example.invalid',
        subject: 'Örnek',
        template: 'contact.requested',
        idempotencyKey: '1',
        text: '<script> & https://evil.invalid/x https://portal.invalid/bildirim-yanit#token=abc&choice=YES',
      },
      'https://portal.invalid',
    );
    expect(result.html).toContain('&lt;script&gt; &amp;');
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('href="https://evil.invalid');
    expect(result.html).toContain(
      'href="https://portal.invalid/bildirim-yanit#token=abc&amp;choice=YES"',
    );
    expect(result.text).toContain('https://portal.invalid/hesap/bildirimler');
  });
});

it.each(['contact.requested', 'monthlyDigest.summary'])(
  '%s koyu modunda onaylı zemini ve okunur bağlantıyı belirtir',
  (template) => {
    const result = decorateEmail(
      {
        to: 'test@example.invalid',
        subject: 'Örnek',
        template,
        idempotencyKey: '1',
        text: 'https://portal.invalid/ornek',
      },
      'https://portal.invalid',
    );
    expect(result.html).toContain('prefers-color-scheme:dark');
    expect(result.html).toContain('background:#0e1a38!important');
    expect(result.html).toContain('color:#b8b8ff!important');
    if (template === 'monthlyDigest.summary')
      expect(result.html).toContain('.email-brand-portal{color:#a3a3ff!important}');
  },
);

const templates = [
  'auth.sign-in-link',
  'auth.change-email-confirmation',
  'auth.change-email-verification',
  'graduation-document.approved',
  'graduation-document.rejected',
  'pilot.invitation',
  'experience.moderation-approved',
  'experience.moderation-rejected',
  'contact.requested',
  'cv.review.requested',
  'cv.review.answered',
  'cv.review.expired',
  'cv.invitation',
  'profile.freshness',
  'alumni.still-there',
  'student.email-migration',
  'appointment.feedback',
  'appointment.requested',
  'appointment.confirmed',
  'appointment.declined',
  'appointment.cancelled',
  'appointment.expired',
  'appointment.reminder',
  'appointment.linkNeeded',
  'appointment.linkAdded',
  'faq.published',
  'faq.rejected',
  'faq.redirected',
  'faq.answerPublished',
  'referral.updated',
  'jobMatch.digest',
  'applicationWindow.reminder',
  'monthlyDigest.summary',
  'jobPosting.published',
  'jobPosting.rejected',
  'jobPosting.expired',
];
it.each(templates)('%s için tek ana eylem, güvenli bağlantı ve kaçış', (template) => {
  const body =
    '<img src=x onerror=alert(1)> https://evil.invalid/a https://portal.invalid/first?x=1&y=2 https://portal.invalid/second';
  const result = decorateEmail(
    { to: 'test@example.invalid', subject: 'Örnek', template, idempotencyKey: '1', text: body },
    'https://portal.invalid',
  );
  expect(result.text).toBe(
    `${body}\n\nBildirim tercihlerin: https://portal.invalid/hesap/bildirimler`,
  );
  expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(result.html).not.toContain('<img');
  expect(result.html).toContain('width="600"');
  expect(result.html).not.toContain('href="https://evil.invalid');
  expect(result.html).toContain(
    'class="email-button" href="https://portal.invalid/first?x=1&amp;y=2"',
  );
  expect(result.html?.match(/class="email-button"/g)).toHaveLength(1);
  expect(result.html).toContain('href="https://portal.invalid/second"');
  expect(result.html).toContain('İstanbul Üniversitesi YBS öğrencileri ve mezunları için');
});

it('gövdesinde iç bağlantı olmayan randevuda dış URL düz kalır ve eylem uygulamaya gider', () => {
  const result = decorateEmail(
    {
      to: 'test@example.invalid',
      subject: 'Örnek',
      template: 'appointment.confirmed',
      idempotencyKey: '1',
      text: 'Görüşme: https://meet.example.invalid/room',
    },
    'https://portal.invalid',
  );
  expect(result.html).not.toContain('href="https://meet.example.invalid');
  expect(result.html).toContain(
    'class="email-button" href="https://portal.invalid/hesap/gorusmeler"',
  );
  expect(result.html).toContain('Randevuyu gör');
});
it('evet ve hayır bağlantıları farklı anlamlarını korur', () => {
  const result = decorateEmail(
    {
      to: 'test@example.invalid',
      subject: 'Örnek',
      template: 'alumni.still-there',
      idempotencyKey: '1',
      text: 'Evet: https://portal.invalid/yes Hayır: https://portal.invalid/no',
    },
    'https://portal.invalid',
  );
  expect(result.html).toContain('href="https://portal.invalid/yes"');
  expect(result.html).toContain('Evet, hâlâ çalışıyorum');
  expect(result.html).toContain('Hayır: <a href="https://portal.invalid/no"');
});

it('eksik tek kullanımlık bağlantı yerine onay veya evet eylemi varmış gibi sunmaz', () => {
  for (const template of [
    'auth.sign-in-link',
    'auth.change-email-confirmation',
    'pilot.invitation',
    'alumni.still-there',
  ]) {
    const result = decorateEmail(
      {
        to: 'test@example.invalid',
        subject: 'Örnek',
        template,
        idempotencyKey: '1',
        text: 'Bağlantı yok',
      },
      'https://portal.invalid',
    );
    expect(result.html).toContain('MezunPortal’ı aç');
    expect(result.html).not.toContain('Evet, hâlâ çalışıyorum');
    expect(result.html).not.toContain('Daveti kabul et');
  }
});
it('satır sonlarını Outlook uyumlu HTML kırılımına çevirir, düz metni değiştirmez', () => {
  const result = decorateEmail(
    {
      to: 'test@example.invalid',
      subject: 'Örnek',
      template: 'contact.requested',
      idempotencyKey: '1',
      text: 'Birinci\nİkinci',
    },
    'https://portal.invalid',
  );
  expect(result.html).toContain('Birinci<br>İkinci');
  expect(result.text).toContain('Birinci\nİkinci');
});

it.each([
  ['student.email-migration', 'E-postanı güncelle'],
  ['faq.redirected', 'Mentorları gör'],
  ['cv.invitation', 'Deneyimini paylaş'],
])('%s eylemi hedefi doğru anlatır', (template, label) => {
  const result = decorateEmail(
    {
      to: 'test@example.invalid',
      subject: 'Örnek',
      template,
      idempotencyKey: '1',
      text: 'https://portal.invalid/hedef',
    },
    'https://portal.invalid',
  );
  expect(result.html).toContain(`>${label}</a>`);
});

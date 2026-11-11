// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { buildAppointmentEmail } from '@/server/services/appointment-notifier';
import { decorateEmail } from './email-presentation';

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

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { decorateEmail, preheaderOf } from './email-presentation';
import messages from '../../../messages/tr.json';
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
  expect(result.html).toContain('class="email-button" href="https://portal.invalid/randevular"');
  expect(result.html).toContain('Randevuyu gör');
});
const stillThere = (yes: string, no: string) =>
  decorateEmail(
    {
      to: 'test@example.invalid',
      subject: 'Örnek',
      template: 'alumni.still-there',
      idempotencyKey: '1',
      text: messages.notifications.email.stillThereText
        .replace('{company}', 'Anadolu Teknoloji A.Ş.')
        .replace('{yesUrl}', yes)
        .replace('{noUrl}', no),
    },
    'https://portal.invalid',
  );

it('evet ve hayır iki ayrı düğmedir: farklı anlam, farklı bağlantı, ham adres ve ön ek yok', () => {
  const yes = 'https://portal.invalid/bildirim-yanit#token=YES.abc&choice=YES';
  const no = 'https://portal.invalid/bildirim-yanit#token=NO.abc&choice=NO';
  const result = stillThere(yes, no);
  const document = new DOMParser().parseFromString(result.html!, 'text/html');
  const links = [...document.querySelectorAll('a.email-button')];
  expect(links.map((a) => a.textContent)).toEqual([
    'Evet, hâlâ çalışıyorum',
    'Hayır, artık çalışmıyorum',
  ]);
  expect(links.map((a) => a.getAttribute('href'))).toEqual([yes, no]);
  // Yalnız "evet" birincil eylemdir; "hayır" ikincil (çerçeveli) düğmedir ve gövde metninde ön ek/ham adres kalmaz.
  expect(links[0]!.className).toBe('email-button');
  expect(links[1]!.className).toBe('email-button email-button-secondary');
  const body = document.querySelector('.email-body')!.textContent!;
  expect(body).not.toMatch(/Evet:|Hayır:|https?:\/\//);
  expect(body).toContain('Anadolu Teknoloji A.Ş. bünyesinde misin?');
  // Düz metin okunur: soru ve iki bağlantı ayrı satırlarda.
  expect(result.text).toContain(`bünyesinde misin?\n\nEvet: ${yes}\n\nHayır: ${no}\n\n`);
});

it('ana eylem düğmesi cümle ortasında kalmaz: satır başında değilse kendi satırına iner', () => {
  const html = (text: string) =>
    decorateEmail(
      {
        to: 'test@example.invalid',
        subject: 'Örnek',
        template: 'contact.requested',
        idempotencyKey: '1',
        text,
      },
      'https://portal.invalid',
    ).html!;
  // Bağlantı cümlenin sonunda: düğmeden önce satır sonu.
  expect(html('Ayrıntı için: https://portal.invalid/x')).toContain(
    'Ayrıntı için: <br><a class="email-button" href="https://portal.invalid/x"',
  );
  // Bağlantı zaten kendi satırında: fazladan satır sonu yok.
  expect(html('Tıkla:\nhttps://portal.invalid/x')).toContain(
    'Tıkla:<br><a class="email-button" href="https://portal.invalid/x"',
  );
  // Bağlantı metnin başında: önüne boşluk eklenmez.
  expect(html('https://portal.invalid/x Sonra')).toContain(
    '<div style="white-space:pre-line;margin:0"><a class="email-button"',
  );
});

it('ikincil iç bağlantı ham jetonu değil kısa adresi gösterir ama hedefini korur', () => {
  const unsubscribe = 'https://portal.invalid/aylik-ozet/abonelikten-cik#token=dXNlci0x.imza';
  const result = decorateEmail(
    {
      to: 'test@example.invalid',
      subject: 'Örnek',
      template: 'monthlyDigest.summary',
      idempotencyKey: '1',
      text: `Uygulamada görüntüle: https://portal.invalid/hesap/aylik-ozet\n\nAboneliği kapat: ${unsubscribe}`,
    },
    'https://portal.invalid',
  );
  const document = new DOMParser().parseFromString(result.html!, 'text/html');
  const link = document.querySelector('a:not(.email-button)[href*="abonelikten-cik"]')!;
  expect(link.getAttribute('href')).toBe(unsubscribe);
  expect(link.textContent).toBe('portal.invalid/aylik-ozet/abonelikten-cik');
  expect(document.querySelector('.email-body')!.textContent).not.toContain('dXNlci0x');
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
    expect(result.html).toContain('MezunPortal&#39;ı aç');
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

const headMail = (subject = 'Randevun onaylandı & <hazır>') => {
  const result = decorateEmail(
    {
      to: 'test@example.invalid',
      subject,
      template: 'contact.requested',
      idempotencyKey: '1',
      text: 'Merhaba',
    },
    'https://portal.invalid',
  );
  return new DOMParser().parseFromString(result.html!, 'text/html');
};

describe('belge başlığı', () => {
  it('dil Türkçe, karakter kodlaması UTF-8 olarak belirtilir', () => {
    const document = headMail();
    expect(document.documentElement.lang).toBe('tr');
    expect(document.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
  });

  it('sayfa başlığı konu satırıdır ve kaçışlıdır', () => {
    expect(headMail().title).toBe('Randevun onaylandı & <hazır>');
  });

  it('açık ve koyu kip hem standart hem eski istemci başlığıyla bildirilir', () => {
    const document = headMail();
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe(
      'light dark',
    );
    expect(
      document.querySelector('meta[name="supported-color-schemes"]')?.getAttribute('content'),
    ).toBe('light dark');
  });

  it('altbilgi en az 14 px ve tercih bağlantısı dokunmatikte ≥ 44 px (dikey dolgu)', () => {
    const footer = headMail().querySelector('.email-footer') as HTMLElement;
    expect(footer.style.fontSize).toBe('14px');
    expect(footer.querySelector('a')!.getAttribute('style')).toContain(
      'display:inline-block;padding:12px 0',
    );
  });
});

describe('ön izleme metni (preheader)', () => {
  it('gizli bir öğedir ve ilk cümleyi taşır; selamlama, bağlantı ve gerekçe girmez', () => {
    const result = decorateEmail(
      {
        to: 'test@example.invalid',
        subject: 'Örnek',
        template: 'graduation-document.rejected',
        idempotencyKey: '1',
        text: 'Merhaba,\n\nMezun belgen onaylanamadı. Gerekçe: Belgedeki ad okunamıyor.\n\nhttps://portal.invalid/dogrulama',
      },
      'https://portal.invalid',
    );
    const document = new DOMParser().parseFromString(result.html!, 'text/html');
    const pre = document.querySelector('.email-preheader') as HTMLElement;
    expect(pre.style.display).toBe('none');
    expect(pre.textContent!.replace(/[\u200c\u00a0]/g, '')).toBe('Mezun belgen onaylanamadı.');
    expect(document.body.firstElementChild).toBe(pre);
  });

  it.each([
    [
      "MezunPortal'a girmek için bu bağlantıya tıkla:\nhttps://portal.invalid/x",
      "MezunPortal'a girmek için bu bağlantıya tıkla",
    ],
    ['Hâlâ Anadolu A.Ş. bünyesinde misin? Evet', 'Hâlâ Anadolu A.Ş. bünyesinde misin?'],
    [
      'Zeynep ile 4 Aralık 14:30 için görüşmen onaylandı.\n\nYer: Beyazıt',
      'Zeynep ile 4 Aralık 14:30 için görüşmen onaylandı.',
    ],
    ['https://portal.invalid/yalniz-baglanti', ''],
    ['Merhaba,', ''],
  ])('%j → %j', (text, expected) => {
    expect(preheaderOf(text)).toBe(expected);
  });

  it('uzun ilk cümleyi kelime sınırında 100 karakterde keser', () => {
    const long = `${'kelime '.repeat(30)}son`;
    const out = preheaderOf(long);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });
});

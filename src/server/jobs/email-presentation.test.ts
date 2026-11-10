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
  },
);

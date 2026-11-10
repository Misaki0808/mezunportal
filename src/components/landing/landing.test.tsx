import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const messages = JSON.parse(
  readFileSync(new URL('../../../messages/tr.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const lookup = (path: string): string =>
  path
    .split('.')
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown>)[key],
      messages.landing,
    ) as string;

vi.mock('next-intl/server', () => ({ getTranslations: async () => lookup }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DEPARTMENT_LINKS, Landing } from './landing';

const render = async (stats: Parameters<typeof Landing>[0]['stats']) =>
  renderToStaticMarkup(await Landing({ stats }));
const empty = { available: true, experiences: null, mentors: null, meetings: null };

describe('tanıtım sayfası (İÜ YBS)', () => {
  it('sabit ana başlık ve fakülte · bölüm başlığı vardır', async () => {
    const html = await render(empty);
    expect(html).toContain('Staj ararken');
    expect(html).toContain('yalnız değilsin.');
    expect(html).toContain('İstanbul Üniversitesi İktisat Fakültesi · Yönetim Bilişim Sistemleri');
  });

  it('dönen satır ilk satırla başlar; dokuz satırın hepsi mesaj kataloğundadır', async () => {
    const html = await render(empty);
    const rotating = (messages.landing as { rotating: Record<string, string> }).rotating;
    expect(Object.keys(rotating)).toHaveLength(9);
    expect(html).toContain('Sen giderken dönen arkadaşların var, bir destek alsana?');
    // yalnız ilk satır sayfada; diğerleri tarayıcıda dönünce gelir
    expect(html).not.toContain('Mezunlar yardım etmek istiyor');
  });

  it('Bölümümüz: beş bağlantı bölümün adreslerine, yeni sekmede ve noopener noreferrer ile açılır', async () => {
    const html = await render(empty);
    expect(DEPARTMENT_LINKS.map((l) => l.href)).toEqual([
      'https://mis-iktisat.istanbul.edu.tr/tr/_',
      'https://mis-iktisat.istanbul.edu.tr/tr/akademikkadro',
      'https://www.linkedin.com/company/mis-iktisat/posts/',
      'https://www.instagram.com/mis_iktisat/',
      'https://www.instagram.com/iuybskulubu/',
    ]);
    for (const { href } of DEPARTMENT_LINKS) {
      const anchor = new RegExp(
        `<a href="${href.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*>`,
      ).exec(html)?.[0];
      expect(anchor, href).toBeDefined();
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
  });

  it('altbilgide öğrenci projesi notu; stok görsel ve süs yıldızı yok', async () => {
    const html = await render(empty);
    expect(html).toContain(
      'Bu bir öğrenci projesidir; İstanbul Üniversitesi&#x27;nin resmî hizmeti değildir.',
    );
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/[✳✦✨★⭐]/u);
  });

  it('sayılar yalnız 3 ve üstündeyken görünür; hiçbiri yoksa bölüm hiç basılmaz', async () => {
    expect(await render(empty)).not.toContain('landing-stats');
    const some = await render({ available: true, experiences: 12, mentors: null, meetings: 3 });
    expect(some).toContain('landing-stats');
    expect(some).toContain('paylaşılan deneyim');
    expect(some).toContain('gerçekleşen görüşme');
    expect(some).not.toContain('aktif mentor');
  });
});

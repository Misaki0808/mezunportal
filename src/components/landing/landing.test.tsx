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

// Alt ad alanları (`landing.preview`) için: her getTranslations çağrısı `landing` köküne göre çözülür.
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace?: string) => (path: string) =>
    lookup(
      namespace && namespace !== 'landing'
        ? `${namespace.replace(/^landing\./, '')}.${path}`
        : path,
    ),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DEPARTMENT_LINKS, Landing, ROTATING_KEYS } from './landing';

const render = async (stats: Parameters<typeof Landing>[0]['stats']) =>
  renderToStaticMarkup(await Landing({ stats }));
const empty = {
  available: true,
  experiences: null,
  mentors: null,
  meetings: null,
  jobs: null,
  companies: null,
};

describe('tanıtım sayfası (İÜ YBS)', () => {
  it('sabit ana başlık ve fakülte · bölüm başlığı vardır', async () => {
    const html = await render(empty);
    expect(html).toContain('Staj ararken');
    expect(html).toContain('yalnız değilsin.');
    expect(html).toContain('İstanbul Üniversitesi İktisat Fakültesi · Yönetim Bilişim Sistemleri');
  });

  it('dönen satır ilk satırla başlar; on satırın hepsi mesaj kataloğundadır', async () => {
    const html = await render(empty);
    const rotating = (messages.landing as { rotating: Record<string, string> }).rotating;
    expect(Object.keys(rotating)).toHaveLength(10);
    expect(rotating.line10).toBe('Hangi seçmeli ders işine yarar, mezunlar söylesin.');
    // Dönen satırlar istemcide döner (statik çıktıda yalnız ilki görünür): sayfaya verilen anahtarlar katalogla birebir aynı olmalı.
    expect([...ROTATING_KEYS]).toEqual(Object.keys(rotating));
    expect(ROTATING_KEYS).toHaveLength(10);
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
    const some = await render({ ...empty, experiences: 12, meetings: 3 });
    expect(some).toContain('landing-stats');
    expect(some).toContain('paylaşılan deneyim');
    expect(some).toContain('gerçekleşen görüşme');
    expect(some).not.toContain('aktif mentor');
  });

  it('sayı bandı beş sayıyı simgeli kartlarda gösterir; gizlilik notu yazar', async () => {
    const html = await render({
      available: true,
      experiences: 12,
      mentors: 4,
      meetings: 9,
      jobs: 5,
      companies: 7,
    });
    for (const label of [
      'paylaşılan deneyim',
      'aktif mentor',
      'gerçekleşen görüşme',
      'açık ilan',
      'şirketten deneyim',
    ])
      expect(html).toContain(label);
    expect((html.match(/<dd>/g) ?? []).length).toBe(5);
    expect(html).toContain('Gizlilik için üç kişiden azını ilgilendiren sayılar gösterilmez.');
  });

  it('kahramanda ürünün kendi bileşenleriyle ÖRNEK kart kompozisyonu vardır: dekoratif, etkileşimsiz, açıkça örnek', async () => {
    const html = await render(empty);
    const preview = /<div class="landing-preview"[^>]*>/.exec(html)?.[0] ?? '';
    expect(preview).toContain('aria-hidden="true"');
    expect(preview).toContain('inert');
    expect(html).toContain('Örnek görünüm');
    expect(html).toContain('Örnek Mezun');
    expect(html).toContain('Örnek Yazılım A.Ş.');
    // Önizleme içinde gerçek bağlantı/düğme yok (yalnız düğme SINIFLI süs öğeleri).
    const block = html.slice(html.indexOf('landing-preview'), html.indexOf('</main>'));
    const previewHtml = block.slice(
      0,
      block.indexOf('landing-stats') > 0
        ? block.indexOf('landing-stats')
        : block.indexOf('id="nasil-calisir"'),
    );
    expect(previewHtml).not.toMatch(/<(a|button)\b/);
  });

  it('durdur/devam et düğmesi ve metinleri yoktur (kullanıcı kararı, 12 Kas)', async () => {
    const html = await render(empty);
    expect(html).not.toContain('landing-motion-toggle');
    expect(html).not.toContain('Durdur');
    const landing = messages.landing as Record<string, unknown>;
    for (const key of ['pause', 'resume', 'pauseLabel', 'resumeLabel', 'motionReduced'])
      expect(landing[key]).toBeUndefined();
  });
});

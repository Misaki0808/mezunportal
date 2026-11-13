import { loginAs } from './login';
import { expect, test, type Page } from './fixture';

// Kart 280: koyu tema hiç bütünüyle taranmamıştı. Bu senaryo, 390 px koyu kipte seçili ekranlarda HESAPLANMIŞ stilden WCAG AA
// karşıtlığını ölçer: metin (normal ≥ 4,5, büyük ≥ 3), yer tutucu (≥ 4,5) ve kit kontrol sınırı/dolgusu (≥ 3). Devre dışı öğeler,
// görünmez (opacity 0 ya da sr-only) öğeler ve tarayıcının kendi çizdiği onay kutusu/radyo düğmeleri dışarıda kalır.
// Token çiftlerinin kendisi `src/lib/contrast.test.ts`'tedir; bu test token'ların EKRANDA doğru birleşip birleşmediğine bakar
// (ör. kontrol sınırında dekoratif `border` token'ı: koyu 1,77:1).
test.use({ colorScheme: 'dark', viewport: { width: 390, height: 844 } });

const SCREENS = {
  student: [
    '/',
    '/ilanlar',
    '/deneyimler',
    '/deneyim/yeni',
    '/mentorlar',
    '/randevular',
    '/profil',
    '/hesap',
    '/hesap/bildirimler',
    '/hesap/gizlilik',
    '/sirketler',
  ],
  systemAdmin: ['/yonetim', '/yonetim/davetler', '/yonetim/kullanicilar', '/yonetim/puan'],
} as const;

type Issue = { kind: string; el: string; text?: string; ratio: number; need: number };

const SCAN = (): Issue[] => {
  type RGBA = { r: number; g: number; b: number; a: number };
  const parse = (value: string): RGBA => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return { r: 0, g: 0, b: 0, a: 0 };
    const p = m[1]!
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: p[0]!, g: p[1]!, b: p[2]!, a: p[3] ?? 1 };
  };
  const over = (top: RGBA, bottom: RGBA): RGBA => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
      a,
    };
  };
  const lum = (c: RGBA) => {
    const f = (v: number) =>
      v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a: RGBA, b: RGBA) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const page = parse(getComputedStyle(document.documentElement).backgroundColor);
  const base: RGBA = page.a > 0 ? page : { r: 255, g: 255, b: 255, a: 1 };
  const behind = (el: Element, includeSelf: boolean): RGBA => {
    const layers: RGBA[] = [];
    for (let e: Element | null = includeSelf ? el : el.parentElement; e; e = e.parentElement) {
      const bg = parse(getComputedStyle(e).backgroundColor);
      if (bg.a > 0) layers.push(bg);
      if (bg.a >= 1) break;
    }
    let c = base;
    for (const layer of layers.reverse()) c = over(layer, c);
    return c;
  };
  const opacityOf = (el: Element) => {
    let o = 1;
    for (let e: Element | null = el; e; e = e.parentElement)
      o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width >= 2 && r.height >= 2 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const disabled = (el: Element) =>
    !!el.closest('[disabled], [aria-disabled="true"], :disabled, [inert]') ||
    !!el.closest('label')?.querySelector(':disabled');
  const sel = (el: Element) =>
    el.tagName.toLowerCase() +
    '.' +
    String(el.getAttribute('class') ?? '')
      .replace(/\s+/g, '.')
      .slice(0, 60);
  const issues: Issue[] = [];

  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'OPTION', 'NOSCRIPT'].includes(el.tagName.toUpperCase())) continue;
    if (!visible(el) || disabled(el)) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) continue;
    const s = getComputedStyle(el);
    const bg = behind(el, true);
    const fg0 = parse(s.color);
    const fg = over({ ...fg0, a: fg0.a * opacityOf(el) }, bg);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need)
      issues.push({
        kind: 'metin',
        el: sel(el),
        text: (el.textContent ?? '').trim().slice(0, 30),
        ratio: r,
        need,
      });
  }
  for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    if (!visible(el) || disabled(el)) continue;
    const bg = behind(el, true);
    const ph = parse(getComputedStyle(el, '::placeholder').color);
    const r = ratio(over({ ...ph, a: ph.a * opacityOf(el) }, bg), bg);
    if (r < 4.5) issues.push({ kind: 'yer-tutucu', el: sel(el), ratio: r, need: 4.5 });
  }
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    if (!visible(el) || disabled(el)) continue;
    const s = getComputedStyle(el);
    if (Number(s.opacity) === 0) continue; // örtü girdileri (ör. dosya seçici): sınırı sarmalayıcıda
    const type = (el as HTMLInputElement).type;
    if ((type === 'checkbox' || type === 'radio') && s.appearance !== 'none') continue; // tarayıcı çizimi
    const out = behind(el, false);
    const border = parse(s.borderTopColor);
    const hasBorder = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none';
    const fill = parse(s.backgroundColor);
    const r = Math.max(
      hasBorder ? ratio(over(border, out), out) : 0,
      fill.a > 0 ? ratio(over(fill, out), out) : 0,
    );
    if (r < 3) issues.push({ kind: 'kontrol-siniri', el: sel(el), ratio: r, need: 3 });
  }
  return issues;
};

async function scan(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
  ).toContain('dark');
  return page.evaluate(SCAN);
}

for (const [persona, routes] of Object.entries(SCREENS)) {
  test(`koyu tema (390 px, ${persona}): metin, yer tutucu ve kontrol sınırı WCAG AA`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, persona as 'student' | 'systemAdmin');
    for (const route of routes) {
      expect(await scan(page, route), `koyu tema karşıtlık hataları: ${persona} ${route}`).toEqual(
        [],
      );
    }
  });
}

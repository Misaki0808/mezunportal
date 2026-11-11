import type { Page } from '@playwright/test';

/** Erişilebilirlik turu için sayfa içi ölçümler (kütüphane yok): ad, odak göstergesi, kontrast, yatay taşma. */
export type A11yReport = {
  overflowX: boolean;
  mains: number;
  h1s: number;
  unnamed: string[];
  /** Aynı erişilebilir ada sahip ama FARKLI adrese giden bağlantılar (WCAG 2.4.4): ekran okuyucu bağlantı listesinde ayırt edilemez. */
  duplicateLinks: string[];
  lowContrast: string[];
  background: { r: number; g: number; b: number };
};

export async function measurePage(page: Page): Promise<A11yReport> {
  return page.evaluate(() => {
    type Rgb = [number, number, number];
    const parse = (value: string): { rgb: Rgb; a: number } | null => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1]!.split(/[ ,/]+/).map(Number);
      return { rgb: [parts[0]!, parts[1]!, parts[2]!], a: parts.length > 3 ? parts[3]! : 1 };
    };
    const background = (element: Element): Rgb => {
      const layers: { rgb: Rgb; a: number }[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (color && color.a > 0) {
          layers.push(color);
          if (color.a >= 1) break;
        }
      }
      let base: Rgb = [255, 255, 255];
      for (const layer of layers.reverse())
        base = base.map((v, i) => Math.round(layer.rgb[i]! * layer.a + v * (1 - layer.a))) as Rgb;
      return base;
    };
    const luminance = (c: Rgb) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: Rgb, b: Rgb) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) > 0 &&
        box.width > 0 &&
        box.height > 0 &&
        !element.closest('[hidden], [inert]')
      );
    };
    const labelledBy = (element: Element) =>
      (element.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
    const nameOf = (element: Element): string => {
      const direct = element.getAttribute('aria-label')?.trim() || labelledBy(element);
      if (direct) return direct;
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        const labels = [...(element.labels ?? [])]
          .map((l) => l.textContent?.trim() ?? '')
          .join(' ')
          .trim();
        if (labels) return labels;
        return element.getAttribute('title')?.trim() ?? '';
      }
      const text = (element as HTMLElement).innerText?.trim();
      if (text) return text;
      const alt = element.querySelector('img[alt], svg[aria-label], [role="img"][aria-label]');
      return (
        alt?.getAttribute('alt')?.trim() ||
        alt?.getAttribute('aria-label')?.trim() ||
        element.getAttribute('title')?.trim() ||
        ''
      );
    };

    const unnamed: string[] = [];
    for (const element of document.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], summary',
    )) {
      if (!visible(element) || (element as HTMLElement).closest('.sr-only')) continue;
      if (!nameOf(element))
        unnamed.push(
          `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).split(' ')[0]}` : ''}`,
        );
    }

    const destinations = new Map<string, Set<string>>();
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (!visible(link) || link.closest('.sr-only')) continue;
      const name = nameOf(link).replace(/\s+/g, ' ').trim().toLowerCase();
      if (!name) continue;
      const target = new URL(link.href, location.href);
      const set = destinations.get(name) ?? new Set<string>();
      set.add(target.pathname + target.search);
      destinations.set(name, set);
    }
    const duplicateLinks = [...destinations]
      .filter(([, targets]) => targets.size > 1)
      .map(([name, targets]) => `${name} (${targets.size} farklı adres)`);

    const lowContrast: string[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent?.trim();
      const element = node.parentElement;
      if (
        !text ||
        !element ||
        seen.has(element) ||
        !visible(element) ||
        element.closest('.sr-only')
      )
        continue;
      seen.add(element);
      const style = getComputedStyle(element);
      const color = parse(style.color);
      if (!color) continue;
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const value = ratio(color.rgb, background(element));
      if (value < (large ? 3 : 4.5)) lowContrast.push(`${text.slice(0, 40)} (${value.toFixed(2)})`);
    }

    return {
      overflowX: document.documentElement.scrollWidth > innerWidth,
      mains: document.querySelectorAll('main, [role="main"]').length,
      h1s: [...document.querySelectorAll('h1')].filter(visible).length,
      unnamed,
      duplicateLinks,
      lowContrast,
      background: (() => {
        const [r, g, b] = background(document.body);
        return { r, g, b };
      })(),
    };
  });
}

export const luminanceOf = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** Klavyeyle gezinti: Tab'a basar; her odak hedefi görünür, odak göstergesi var ve odak bir yere sıkışmaz. */
export async function tabThrough(page: Page, steps = 30) {
  const problems: string[] = [];
  const seen = new Set<string>();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      // Tarih/saat girişinin iç parçaları (gün/ay alanları, takvim düğmesi) tarayıcının kendi odak halkasını çizer; ana öğe odakta kalır.
      const native = element.matches(
        'input[type="date"], input[type="datetime-local"], input[type="time"], input[type="month"], input[type="week"]',
      );
      const outline =
        native || (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0);
      const shadow = style.boxShadow !== 'none';
      return {
        key: `${element.tagName}:${element.id}:${(element.textContent ?? '').trim().slice(0, 30)}:${Math.round(box.top + scrollY)}`,
        indicator: outline || shadow,
        sized: box.width > 0 && box.height > 0,
      };
    });
    if (!info) continue;
    seen.add(info.key);
    if (!info.sized) problems.push(`odak görünmez öğede: ${info.key}`);
    if (!info.indicator) problems.push(`odak göstergesi yok: ${info.key}`);
  }
  return { problems, distinct: seen.size };
}

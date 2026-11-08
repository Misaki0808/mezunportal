import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
export const BASE = 'http://localhost:3308';
export const OUT = '../../pm-handoff/kanit/2026-11-08/p1-06-r1';
export const WIDTHS = [[360, 780], [390, 844], [1440, 900]];
export async function open() {
  await mkdir(OUT, { recursive: true });
  return chromium.launch();
}
export function track(page, log) {
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(`console.${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 500) log.push(`HTTP ${r.status()} ${r.url()}`); });
}
export async function persona(browser, who) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/giris/test?persona=${who}`);
  await p.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await p.waitForURL(`${BASE}/hesap`);
  await p.close();
  return ctx;
}
/** Sayfa ölçümü: yatay kaydırma, 44 px altı hedefler, alt gezinme, başlık, eylemler. */
export async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const name = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('name') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 60);
    const targets = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab]')].filter(vis);
    const small = targets.filter((el) => { const r = el.getBoundingClientRect(); const lab = el.closest('label'); const lr = lab?.getBoundingClientRect(); const h = Math.max(r.height, lr?.height ?? 0); return h < 44 && !el.closest('[data-skip-link]') && el.className.toString().indexOf('sr-only') < 0; }).map((el) => ({ n: name(el), ...box(el) }));
    const overflow = [...document.querySelectorAll('body *')].filter(vis).filter((el) => { const r = el.getBoundingClientRect(); return r.right > de.clientWidth + 1 || r.left < -1; }).slice(0, 5).map((el) => ({ tag: el.tagName, n: name(el), ...box(el) }));
    return {
      url: location.pathname + location.search,
      scroll: { sw: de.scrollWidth, cw: de.clientWidth, sh: de.scrollHeight, vh: innerHeight },
      h1: [...document.querySelectorAll('h1')].map((e) => e.innerText.trim()),
      nav: [...document.querySelectorAll('nav')].filter(vis).map((n) => ({ label: n.getAttribute('aria-label'), ...box(n) })),
      controls: targets.map((el) => ({ t: el.tagName.toLowerCase() + (el.type ? ':' + el.type : ''), n: name(el), ...box(el) })).slice(0, 40),
      small, overflow,
      alerts: [...document.querySelectorAll('[role=alert],[role=status]')].filter(vis).map((e) => e.innerText.trim().slice(0, 120)),
    };
  });
}
export async function shot(page, label, w, h, results, extra) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(250);
  const file = `${OUT}/${label}-${w}.png`;
  await page.screenshot({ path: file, fullPage: true });
  const m = await measure(page);
  results.push({ label, w, file, ...m, ...(extra ?? {}) });
  return m;
}
export async function save(name, data) { await writeFile(`${OUT}/${name}.json`, JSON.stringify(data, null, 1)); }

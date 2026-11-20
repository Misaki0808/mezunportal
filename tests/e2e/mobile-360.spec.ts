import { expect, test, type Page } from './fixture';
import { loginAs } from './login';

// 360 px mobil tur (kart 536): ürünün en küçük hedefi 360 px'tir (docs/design.md "Mobil öncelik"). Gece değişen listelerde, kuyruklarda ve
// KVKK ekranlarında; açık + koyu temada; 360 ve 390 genişlikte: yatay taşma yok, alt gezinme etiketleri tek satır, dokunma hedefi ≥ 44 px,
// dosya seçicide yer tutucu kesilmiyor. Ölçüm tarayıcıdadır (jsdom yerleşim bilmez); bulgu çıkarsa sayfa düzeltilir, test gevşetilmez.
const SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

const STUDENT = [
  '/ilanlar',
  '/ilanlar?page=2',
  '/mezunlar',
  '/mezunlar?page=2',
  '/sirketler',
  '/mentorlar',
  '/deneyimler',
  '/basvuru-takvimi',
  '/hesap/veriler',
  '/hesap',
];
const ADMIN = [
  '/yonetim/ilanlar',
  '/yonetim/sikayetler',
  '/yonetim/deneyimler',
  '/yonetim/puan',
  '/yonetim/ayin-mezunu',
  '/yonetim/eslesmeyenler',
  '/yonetim/davetler',
];

type Report = {
  overflow: number;
  navLabels: { text: string; lines: number; clipped: boolean }[];
  smallControls: string[];
  pickerStatusClipped: boolean;
};

async function measure(page: Page): Promise<Report> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) > 0 &&
        box.width > 2 &&
        box.height > 2 &&
        !element.closest('[hidden], [inert], .sr-only') &&
        !(element.closest('details:not([open])') && !element.closest('summary'))
      );
    };
    const navLabels = [...document.querySelectorAll('[data-bottom-nav] li')].map((item) => {
      const label = item.querySelector('a,button')!.querySelector('span:last-child')!;
      const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
      return {
        text: label.textContent ?? '',
        lines: Math.round(label.getBoundingClientRect().height / lineHeight),
        clipped: label.scrollWidth > label.clientWidth + 1,
      };
    });
    const smallControls: string[] = [];
    const selector =
      'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio]';
    for (const element of document.querySelectorAll(selector)) {
      const target = element.matches('input[type=checkbox],input[type=radio]')
        ? (element.closest('label') ?? element)
        : element;
      if (!visible(target)) continue;
      // Cümle içindeki metin bağlantısı dokunma hedefi sayılmaz (yalnız bağımsız denetimler ölçülür).
      const inline =
        element.tagName === 'A' &&
        getComputedStyle(element).display === 'inline' &&
        (element.parentElement?.textContent ?? '').trim().length >
          (element.textContent ?? '').trim().length + 8;
      if (inline) continue;
      const box = target.getBoundingClientRect();
      if (Math.min(box.width, box.height) < 43.5)
        smallControls.push(
          `${element.tagName.toLowerCase()}[${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 30)}] ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
    }
    const picker = document.querySelector('[id][class*="min-w-0"][class*="flex-1"]');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      navLabels,
      smallControls,
      pickerStatusClipped: picker
        ? picker.scrollWidth > picker.clientWidth + 1 &&
          picker.textContent === 'Henüz dosya seçilmedi'
        : false,
    };
  });
}

async function audit(page: Page, path: string, where: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  if (path === '/yonetim/ayin-mezunu') {
    await page.locator('main select').first().selectOption({ index: 0 });
    await page.getByRole('button', { name: 'Hikâyeleri göster' }).click();
    await page.waitForLoadState('networkidle');
  }
  const report = await measure(page);
  const label = `${path} (${where})`;
  expect.soft(report.overflow, `${label}: yatay taşma`).toBeLessThanOrEqual(0);
  expect.soft(report.navLabels, `${label}: alt gezinme sekmeleri`).toHaveLength(5);
  for (const item of report.navLabels) {
    expect.soft(item.lines, `${label}: "${item.text}" tek satır`).toBe(1);
    expect.soft(item.clipped, `${label}: "${item.text}" kesilmiyor`).toBe(false);
  }
  expect.soft(report.smallControls, `${label}: 44 px altı dokunma hedefi`).toEqual([]);
  expect.soft(report.pickerStatusClipped, `${label}: dosya seçici yer tutucusu`).toBe(false);
}

for (const scheme of SCHEMES) {
  for (const size of SIZES) {
    test.describe(`${scheme} tema, ${size.width}px`, () => {
      test.use({ colorScheme: scheme, viewport: size });
      const where = `${scheme}, ${size.width}px`;

      test('öğrenci ekranları', async ({ page }) => {
        test.setTimeout(240_000);
        await loginAs(page, 'student');
        for (const path of STUDENT) await audit(page, path, where);
      });

      test('yönetim kuyrukları', async ({ page }) => {
        test.setTimeout(240_000);
        await loginAs(page, 'systemAdmin');
        for (const path of ADMIN) await audit(page, path, where);
      });
    });
  }
}

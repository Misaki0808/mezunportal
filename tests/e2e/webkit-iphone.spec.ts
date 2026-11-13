import { loginAs } from './login';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { devices, expect, test, type Page } from './fixture';
import { PrismaClient } from '../../src/generated/prisma/client';

/**
 * Safari (WebKit) + iPhone çekirdek akış turu (kart 200). Yalnız `E2E_WEBKIT=1 ... --project=webkit-iphone` ile koşar
 * (playwright.config.ts); varsayılan çalıştırma ve CI bu dosyayı görmez. `WEBKIT_OUT=<klasör>` verilirse görüntü ve ölçüm
 * JSON'u oraya yazılır. Emülatörün YAPAMADIKLARI (gerçek cihaz gerekir): çentik/güvenli alan değeri (env() = 0), ekran
 * klavyesinin odakta yakınlaştırması, iOS tarih çarkı. Bunlar için yazı boyu ≥ 16 px ve `viewport-fit=cover` denetlenir.
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
const IPHONE = devices['iPhone 13'];
const OUT = process.env.WEBKIT_OUT;
// Ölçülen sayfa gerçek ekran olmalı: rıza kapısı, yetki yok ya da bulunamadı ekranını ölçmek boş (sahte yeşil) sonuç verir.
const NOT_A_REAL_SCREEN =
  /Önce metinleri onaylaman|Başlamadan önce, haklarını bil|senin rolün için değil|Giriş yapman gerekiyor|Aradığın sayfa bulunamadı/;
const MIN_CONTROL_FONT_PX = 16;
const MIN_TAP_PX = 44;

type Persona = 'student' | 'alumniMentor' | 'systemAdmin';

const login = loginAs;

/** Sayfa içi ölçüm: yalnız okur. */
const MEASURE = ({ minFont, minTap }: { minFont: number; minTap: number }) => {
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const label = (e: Element) =>
    (
      (e as HTMLElement).innerText ||
      e.getAttribute('aria-label') ||
      e.getAttribute('name') ||
      e.tagName
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30);
  // Odakta yakınlaştırma: iOS Safari, yazı boyu 16 px altındaki giriş alanına odaklanınca sayfayı büyütür.
  const smallFont = [
    ...document.querySelectorAll(
      'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), select, textarea',
    ),
  ]
    .filter(visible)
    .filter((e) => parseFloat(getComputedStyle(e).fontSize) < minFont)
    .map((e) => `${e.tagName.toLowerCase()}:${label(e)} ${getComputedStyle(e).fontSize}`);
  const tap = [
    ...document.querySelectorAll(
      'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=tab]',
    ),
  ]
    .filter(visible)
    .filter((e) => {
      if (e.closest('.sr-only') || e.classList.contains('sr-only')) return false;
      if (e.tagName === 'INPUT' && ['checkbox', 'radio'].includes((e as HTMLInputElement).type))
        return !((e.closest('label')?.getBoundingClientRect().height ?? 0) >= minTap);
      if (e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.closest('p, li, span'))
        return false;
      const r = e.getBoundingClientRect();
      return r.height < minTap || r.width < minTap;
    })
    .map((e) => {
      const r = e.getBoundingClientRect();
      return `${e.tagName.toLowerCase()}:${label(e)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    });
  // Alt gezinme ile yapışkan/sabit eylem çubukları çakışmamalı. Yapışkan öğe sayfa başında doğal konumundadır (ekran dışı olabilir);
  // bu yüzden konum değil TANIMLI `bottom` ofseti alt gezinme yüksekliğinden küçük mü diye bakılır.
  const nav = document.querySelector('[data-bottom-nav]');
  const navHeight = nav && visible(nav) ? innerHeight - nav.getBoundingClientRect().top : 0;
  const overlap = [...document.querySelectorAll('body *')]
    .filter((e) => {
      if (e === nav || nav?.contains(e)) return false;
      const st = getComputedStyle(e);
      return (
        (st.position === 'fixed' || st.position === 'sticky') && visible(e) && st.bottom !== 'auto'
      );
    })
    .filter((e) => parseFloat(getComputedStyle(e).bottom) < navHeight - 1)
    .map(
      (e) => `${label(e)} bottom=${getComputedStyle(e).bottom} gezinme=${Math.round(navHeight)}px`,
    );
  return {
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    smallFont,
    tap,
    overlap,
    viewportMeta: document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? '',
    height: document.documentElement.scrollHeight,
    head: ((document.querySelector('main') as HTMLElement | null)?.innerText ?? '')
      .replace(/\s+/g, ' ')
      .slice(0, 120),
  };
};

async function tour(
  page: Page,
  persona: Persona,
  screens: { slug: string; path: string; first?: string }[],
) {
  await login(page, persona);
  const report: Record<string, unknown> = {};
  for (const screen of screens) {
    let target = screen.path;
    if (screen.first) {
      await page.goto(screen.path, { waitUntil: 'networkidle' });
      // Liste boşsa tur sessizce yeşil geçmesin ve 5 dakikalık test zaman aşımına da kadar beklemesin (eskiden
      // `getAttribute` var olmayan öğeyi test süresince bekliyordu): önce kısa bekle, yoksa açık hata ver.
      const links = page.locator(screen.first);
      await links
        .first()
        .waitFor({ timeout: 10_000 })
        .catch(() => undefined);
      expect(
        await links.count(),
        `${screen.slug}: "${screen.path}" listesi boş, ayrıntı ekranı ölçülemedi`,
      ).toBeGreaterThan(0);
      const href = await links.first().getAttribute('href');
      expect(href, `${screen.slug}: bağlantının href'i yok`).toBeTruthy();
      target = href!;
    }
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const response = await page.goto(target, { waitUntil: 'networkidle' });
      expect.soft(response?.ok(), `${screen.slug} açıldı`).toBe(true);
      const m = await page.evaluate(MEASURE, { minFont: MIN_CONTROL_FONT_PX, minTap: MIN_TAP_PX });
      const key = `${screen.slug}__${scheme}`;
      report[key] = m;
      expect
        .soft(m.head, `${key}: gerçek ekran (kapı/yetki/bulunamadı değil)`)
        .not.toMatch(NOT_A_REAL_SCREEN);
      expect.soft(m.head.length, `${key}: içerik boş`).toBeGreaterThan(20);
      expect.soft(m.overflowX, `${key}: yatay taşma (scrollWidth ${m.scrollWidth})`).toBe(false);
      expect.soft(m.smallFont, `${key}: 16 px altı giriş alanı (odakta yakınlaştırır)`).toEqual([]);
      expect.soft(m.overlap, `${key}: alt gezinme ile çakışan çubuk`).toEqual([]);
      expect.soft(m.viewportMeta, `${key}: viewport-fit=cover`).toContain('viewport-fit=cover');
      if (OUT) {
        mkdirSync(path.join(OUT, 'webkit'), { recursive: true });
        await page.screenshot({ path: path.join(OUT, 'webkit', `${key}.png`), fullPage: true });
      }
    }
  }
  // Her ekran açık + koyu ölçülmüş olmalı; atlanan ekran varsa tur yeşil sayılmaz.
  expect(Object.keys(report).length, 'ölçülen ekran sayısı').toBe(screens.length * 2);
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      path.join(OUT, `webkit-olcum-${persona}-${screens[0]!.slug}.json`),
      JSON.stringify(report, null, 1),
    );
  }
}

test.describe('WebKit iPhone: çekirdek ekranlar (açık + koyu, 390)', () => {
  test('girişsiz: tanıtım ve giriş', async ({ page }) => {
    test.setTimeout(120_000);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const route of ['/', '/giris']) {
        await page.goto(route, { waitUntil: 'networkidle' });
        const m = await page.evaluate(MEASURE, {
          minFont: MIN_CONTROL_FONT_PX,
          minTap: MIN_TAP_PX,
        });
        expect.soft(m.overflowX, `${route} ${scheme}: taşma`).toBe(false);
        expect.soft(m.smallFont, `${route} ${scheme}: 16 px altı alan`).toEqual([]);
        if (OUT) {
          mkdirSync(path.join(OUT, 'webkit'), { recursive: true });
          await page.screenshot({
            path: path.join(
              OUT,
              'webkit',
              `public${route === '/' ? '-ana' : '-giris'}__${scheme}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
  });

  test('öğrenci 1/3: hesap, profil, deneyim, mentor, randevu', async ({ page }) => {
    test.setTimeout(300_000);
    await tour(page, 'student', [
      { slug: 'hesap', path: '/hesap' },
      { slug: 'profil', path: '/profil' },
      { slug: 'deneyimler', path: '/deneyimler' },
      { slug: 'deneyim-detay', path: '/deneyimler', first: 'a[href^="/deneyim/"]' },
      { slug: 'mentorlar', path: '/mentorlar' },
      { slug: 'randevu-al', path: '/mentorlar', first: 'a[href^="/randevu-al/"]' },
      { slug: 'randevular', path: '/randevular' },
    ]);
  });

  test('öğrenci 2/3: ilan, şirket, soru bankası, başvuru takvimi', async ({ page }) => {
    test.setTimeout(300_000);
    await tour(page, 'student', [
      { slug: 'ilanlar', path: '/ilanlar' },
      {
        slug: 'ilan-detay',
        path: '/ilanlar',
        first: 'a[href^="/ilanlar/"]:not([href="/ilanlar/yeni"])',
      },
      { slug: 'sirketler', path: '/sirketler' },
      { slug: 'mulakat-sorulari', path: '/mulakat-sorulari' },
      { slug: 'basvuru-takvimi', path: '/basvuru-takvimi' },
    ]);
  });

  test('öğrenci 3/3: etkinlik, ders rehberi, bildirimler', async ({ page }) => {
    test.setTimeout(300_000);
    await tour(page, 'student', [
      { slug: 'etkinlikler', path: '/etkinlikler' },
      { slug: 'etkinlik-detay', path: '/etkinlikler', first: 'a[href^="/etkinlikler/"]' },
      { slug: 'ders-rehberi', path: '/ders-rehberi' },
      { slug: 'bildirimler', path: '/hesap/bildirimler' },
    ]);
  });

  test('mezun: ilan ver (çok adımlı), müsaitlik, ilanlarım, ders seçimi', async ({ page }) => {
    test.setTimeout(300_000);
    await tour(page, 'alumniMentor', [
      { slug: 'ilan-yeni', path: '/ilanlar/yeni' },
      { slug: 'mentor-ayarlar', path: '/mentor/ayarlar' },
      { slug: 'ilanlarim', path: '/ilanlarim' },
      { slug: 'profil-dersler', path: '/profil/dersler' },
      { slug: 'hikayem', path: '/hesap/hikayem' },
    ]);
  });

  test('yönetici: etkinlik, puan, ölçüm, işlem kaydı, yılın/ayın mezunu', async ({ page }) => {
    test.setTimeout(300_000);
    await tour(page, 'systemAdmin', [
      { slug: 'yonetim', path: '/yonetim' },
      { slug: 'yonetim-etkinlikler', path: '/yonetim/etkinlikler' },
      { slug: 'yonetim-puan', path: '/yonetim/puan' },
      { slug: 'yonetim-islem-kaydi', path: '/yonetim/islem-kaydi' },
      { slug: 'yonetim-yilin-mezunu', path: '/yonetim/yilin-mezunu' },
      { slug: 'yonetim-ayin-mezunu', path: '/yonetim/ayin-mezunu' },
    ]);
  });
});

test.describe("WebKit iPhone: Safari'ye özgü davranışlar", () => {
  test('tarih/saat girişleri: yerel tür korunur, ≥ 44 px, kapsayıcıdan taşmaz, yazı ≥ 16 px', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const cases: { persona: Persona; route: string }[] = [
      { persona: 'alumniMentor', route: '/mentor/ayarlar' },
      { persona: 'alumniMentor', route: '/ilanlar/yeni' },
      { persona: 'systemAdmin', route: '/yonetim/etkinlikler' },
      { persona: 'systemAdmin', route: '/yonetim/yilin-mezunu' },
      { persona: 'systemAdmin', route: '/yonetim/islem-kaydi' },
    ];
    let current: Persona | null = null;
    let pickers = 0;
    for (const { persona, route } of cases) {
      if (persona !== current) {
        await login(page, persona);
        current = persona;
      }
      await page.goto(route, { waitUntil: 'networkidle' });
      const found = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            'input[type=date], input[type=time], input[type=datetime-local], input[type=month]',
          ),
        ]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map((e) => {
            const input = e as HTMLInputElement;
            const r = e.getBoundingClientRect();
            const parent = (e.closest('label, div, fieldset') ??
              e.parentElement)!.getBoundingClientRect();
            return {
              type: input.getAttribute('type'),
              kept: input.type,
              w: Math.round(r.width),
              h: Math.round(r.height),
              font: parseFloat(getComputedStyle(e).fontSize),
              overflowsParent: r.right > parent.right + 1 || r.left < parent.left - 1,
              overflowsViewport: r.right > innerWidth + 1,
            };
          }),
      );
      pickers += found.length;
      for (const item of found) {
        const id = `${route} ${item.type}`;
        expect.soft(item.kept, `${id}: tarayıcı yerel türü korudu`).toBe(item.type);
        expect.soft(item.h, `${id}: yükseklik ${item.h}px`).toBeGreaterThanOrEqual(MIN_TAP_PX);
        expect
          .soft(item.font, `${id}: yazı ${item.font}px`)
          .toBeGreaterThanOrEqual(MIN_CONTROL_FONT_PX);
        expect
          .soft(item.overflowsParent || item.overflowsViewport, `${id}: taşıyor (${item.w}px)`)
          .toBe(false);
      }
      if (OUT) {
        mkdirSync(path.join(OUT, 'webkit'), { recursive: true });
        await page.screenshot({
          path: path.join(OUT, 'webkit', `tarih-saat__${route.replace(/\//g, '_')}.png`),
          fullPage: true,
        });
      }
    }
    expect(
      pickers,
      'tarih/saat alanları bulundu (boş sonuç sahte yeşil olmasın)',
    ).toBeGreaterThanOrEqual(5);
  });

  test('modal açıkken arka sayfa kaymaz (kaydırma kilidi)', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, 'systemAdmin');
    await page.goto('/yonetim/puan', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Düzenle' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Emülatör dokunmatik kaydırma jesti üretemez (mobil WebKit'te mouse.wheel yok): kilit mekanizması denetlenir.
    // Gerçek iPhone'da örtüye sürükleyince sayfanın kaymadığı elle doğrulanır (docs/engineering.md "Test").
    const locked = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflow,
      body: getComputedStyle(document.body).overflow,
    }));
    expect(locked.html, 'html kaydırması kilitli').toBe('hidden');
    expect(locked.body, 'body kaydırması kilitli').toBe('hidden');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // body'nin kalıcı `overflow-x: hidden` kuralı vardır; kilit dikey kaydırmayı kapatır: overflow-y denetlenir.
    const unlocked = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflowY,
      body: getComputedStyle(document.body).overflowY,
    }));
    expect(unlocked.html, 'kapanınca html dikey kaydırma döner').not.toBe('hidden');
    expect(unlocked.body, 'kapanınca body dikey kaydırma döner').not.toBe('hidden');
  });

  test('etkinlik detayı: yapışkan eylem çubuğu alt gezinmeyi örtmez, son içerik çubuğun altında kalmaz', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, 'student');
    await page.goto('/etkinlikler', { waitUntil: 'networkidle' });
    const href = await page.locator('a[href^="/etkinlikler/"]').first().getAttribute('href');
    await page.goto(href!, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const geometry = await page.evaluate(() => {
      const navEl = document.querySelector('[data-bottom-nav]')!;
      const nav = navEl.getBoundingClientRect();
      const bar = [...document.querySelectorAll('div')].find(
        (e) => getComputedStyle(e).position === 'fixed' && e !== navEl && !navEl.contains(e),
      );
      const barRect = bar?.getBoundingClientRect();
      // Gerçek son içerik: çubuğun içinde olmayan, yaprak ve görünür öğelerin en alt kenarı (kap dolgusu sayılmaz).
      let contentBottom = 0;
      for (const e of document.querySelectorAll('#main-content *')) {
        if (bar?.contains(e) || e.children.length > 0) continue;
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) contentBottom = Math.max(contentBottom, r.bottom);
      }
      return {
        navTop: nav.top,
        barBottom: barRect?.bottom ?? null,
        barTop: barRect?.top ?? null,
        contentBottom,
      };
    });
    expect(geometry.barBottom, 'çubuk var').not.toBeNull();
    expect(geometry.barBottom!, 'çubuk alt gezinmenin üstünde').toBeLessThanOrEqual(
      geometry.navTop + 1,
    );
    expect(geometry.contentBottom, 'son içerik çubuğun altında kalmaz').toBeLessThanOrEqual(
      geometry.barTop! + 1,
    );
  });

  test("logo ve kep SVG'si çizilir (boyut, dolgu, renk geçişi tanımı)", async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/', { waitUntil: 'networkidle' });
      const logo = await page.evaluate(() => {
        const svg = [...document.querySelectorAll('svg')].find((s) =>
          s.querySelector('linearGradient'),
        );
        if (!svg) return null;
        const box = svg.getBoundingClientRect();
        const grad = svg.querySelector('linearGradient')!;
        const painted = [...svg.querySelectorAll('path')].filter((p) => {
          const fill = p.getAttribute('fill') ?? '';
          if (fill.startsWith('url(')) return !!document.getElementById(fill.slice(5, -1));
          return fill !== '' && fill !== 'none';
        }).length;
        return {
          w: Math.round(box.width),
          h: Math.round(box.height),
          gradStops: grad.querySelectorAll('stop').length,
          painted,
        };
      });
      expect(logo, `${scheme}: logo SVG bulundu`).not.toBeNull();
      expect(logo!.w).toBeGreaterThan(100);
      expect(logo!.h).toBeGreaterThan(20);
      expect(logo!.gradStops, 'n–p renk geçişi tanımlı').toBeGreaterThanOrEqual(2);
      expect(logo!.painted, 'dolgulu yollar çözülüyor (url(#id) boşta kalmaz)').toBeGreaterThan(5);
      if (OUT) {
        mkdirSync(path.join(OUT, 'webkit'), { recursive: true });
        await page
          .locator('svg')
          .filter({ has: page.locator('linearGradient') })
          .first()
          .screenshot({ path: path.join(OUT, 'webkit', `logo__${scheme}.png`) });
      }
    }
  });

  test('odak halkası: klavyeyle gezilen alan ve düğmelerde görünür çerçeve çizilir', async ({
    page,
  }) => {
    await page.goto('/giris', { waitUntil: 'networkidle' });
    // Safari (macOS) Tab ile varsayılan olarak yalnız form kontrollerine/düğmelere gider, bağlantılara değil (sistem tercihi
    // "Tab ile her öğeyi vurgula" gerekir): bağlantı odağı Chromium turunda (a11y-tour) ölçülür; burada duraklar sayılır.
    const stops: string[] = [];
    const missing: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const e = document.activeElement as HTMLElement | null;
        if (!e || e === document.body) return null;
        const st = getComputedStyle(e);
        const ring =
          (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) ||
          st.boxShadow !== 'none';
        return {
          name: `${e.tagName.toLowerCase()}:${(e.innerText || e.getAttribute('aria-label') || e.getAttribute('name') || '').slice(0, 24)}`,
          ring,
        };
      });
      if (!stop) continue;
      stops.push(stop.name);
      if (!stop.ring) missing.push(stop.name);
    }
    expect(
      stops.length,
      `Tab en az iki odak durağına gitmeli (boş sonuç sahte yeşil olmasın): ${stops}`,
    ).toBeGreaterThanOrEqual(2);
    expect(missing, 'odak göstergesi olmayan öğe').toEqual([]);
  });
});

test.describe('WebKit iPhone: etkileşimli akışlar', () => {
  test('randevu iste: mentor tarih/saat arayüzüyle müsaitlik açar, öğrenci slot seçip talep eder', async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const mentor = await db.user.findUniqueOrThrow({
      where: { email: 'alumni-mentor@test.mezunportal.local' },
    });
    await db.appointment.deleteMany({
      where: { mentorId: mentor.id, status: { in: ['REQUESTED', 'CONFIRMED'] } },
    });
    await db.availabilityRule.deleteMany({ where: { mentorId: mentor.id } });
    await db.mentorProfile.update({
      where: { userId: mentor.id },
      data: {
        isActive: true,
        pausedUntil: null,
        monthlyCapacity: 40,
        sessionMinutes: 30,
        meetingModes: ['ONLINE'],
        inPersonNote: null,
      },
    });
    await db.rateLimit.deleteMany({});
    const mentorContext = await browser.newContext({ ...IPHONE });
    const studentContext = await browser.newContext({ ...IPHONE });
    try {
      const m = await mentorContext.newPage();
      const st = await studentContext.newPage();
      await login(m, 'alumniMentor');
      await m.goto('/mentor/ayarlar', { waitUntil: 'networkidle' });
      for (const day of [
        'Pazartesi',
        'Salı',
        'Çarşamba',
        'Perşembe',
        'Cuma',
        'Cumartesi',
        'Pazar',
      ]) {
        await m.getByRole('switch', { name: `${day} günü müsait` }).check();
      }
      await m.getByRole('button', { name: 'Müsaitliği kaydet' }).click();
      await expect(m.getByText('Kaydedildi.')).toBeVisible();
      expect(await db.availabilityRule.count({ where: { mentorId: mentor.id } })).toBe(7);

      await login(st, 'student');
      await st.goto(`/randevu-al/${mentor.id}`, { waitUntil: 'networkidle' });
      await expect(st.getByText('Saatler İstanbul saatidir.')).toBeVisible();
      await st
        .getByRole('radio', { name: /saatini seç/ })
        .first()
        .click();
      await st.getByLabel(/Mentora not/).fill('Staj başvurusu hakkında soru.');
      // Slot seçilince yapışkan gönder çubuğu alt gezinmeyi örtmemeli ve alanlar 16 px altı olmamalı.
      const m2 = await st.evaluate(MEASURE, { minFont: MIN_CONTROL_FONT_PX, minTap: MIN_TAP_PX });
      expect(m2.overlap, 'slot seçiciyi saran çubuk alt gezinmeyle çakışıyor').toEqual([]);
      expect(m2.smallFont, '16 px altı alan').toEqual([]);
      await st.getByRole('button', { name: 'Randevu talep et' }).click();
      await expect(st.getByRole('heading', { name: 'Talebin gönderildi' })).toBeVisible();
      expect(
        await db.appointment.count({ where: { mentorId: mentor.id, status: 'REQUESTED' } }),
      ).toBe(1);
    } finally {
      await db.appointment.deleteMany({
        where: { mentorId: mentor.id, status: { in: ['REQUESTED', 'CONFIRMED'] } },
      });
      await mentorContext.close();
      await studentContext.close();
    }
  });

  test('ilan ver: üç adım, tarih girişi ve gönderim', async ({ browser }) => {
    test.setTimeout(240_000);
    const title = `Safari ${randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const context = await browser.newContext({ ...IPHONE });
    try {
      const page = await context.newPage();
      await login(page, 'alumniMentor');
      await page.goto('/ilanlar/yeni', { waitUntil: 'networkidle' });
      await expect(page.getByText('Adım 1 / 3')).toBeVisible();
      await page.getByLabel('Pozisyon adı').fill(title);
      await page.getByLabel('Kurum adı').fill('Örnek Teknoloji');
      await page.getByRole('button', { name: 'Devam et' }).click();
      await expect(page.getByText('Adım 2 / 3')).toBeVisible();
      await page
        .getByLabel('Açıklama')
        .fill(
          'Öğrenciler için ekip çalışması ve yazılım geliştirme odaklı örnek bir staj fırsatıdır.',
        );
      await page.getByLabel('Konum', { exact: true }).fill('İstanbul');
      const deadline = new Date();
      deadline.setUTCDate(deadline.getUTCDate() + 20);
      const dateInput = page.getByLabel('Son başvuru tarihi');
      await dateInput.fill(deadline.toISOString().slice(0, 10));
      // Yerel tarih girişi değeri ISO olarak tutmalı (Safari'de yerelleştirilmiş görünür, değer yyyy-mm-dd kalır).
      await expect(dateInput).toHaveValue(deadline.toISOString().slice(0, 10));
      await page
        .getByRole('checkbox', { name: /Yönetim Bilişim Sistemleri/ })
        .first()
        .check();
      await page.getByRole('checkbox', { name: 'Yazılım geliştirme' }).check();
      await page.getByLabel('HTTPS başvuru bağlantısı').fill('https://example.org/staj');
      const bar = await page.evaluate(MEASURE, {
        minFont: MIN_CONTROL_FONT_PX,
        minTap: MIN_TAP_PX,
      });
      expect(bar.overlap, 'yapışkan eylem çubuğu alt gezinmeyle çakışıyor').toEqual([]);
      expect(bar.smallFont, '16 px altı alan').toEqual([]);
      await page.getByRole('button', { name: 'Devam et' }).click();
      await expect(page.getByText('Adım 3 / 3')).toBeVisible();
      await page.getByRole('button', { name: 'İncelemeye gönder' }).click();
      await page.waitForURL('**/ilanlarim');
      await expect(page.getByText(title)).toBeVisible();
    } finally {
      await context.close();
      const record = await db.jobPosting.findFirst({ where: { title }, select: { id: true } });
      if (record) {
        await db.pointEntry.deleteMany({
          where: { sourceType: 'JOB_POSTING', sourceId: record.id },
        });
        await db.jobPosting.deleteMany({ where: { id: record.id } });
      }
    }
  });

  test('etkinlik kaydı ve ders süzgeci', async ({ browser }) => {
    test.setTimeout(180_000);
    const student = await db.user.findUniqueOrThrow({
      where: { email: 'student@test.mezunportal.local' },
    });
    const membership = await db.membership.findFirstOrThrow({
      where: { userId: student.id, role: 'STUDENT', verificationStatus: 'VERIFIED', endedAt: null },
    });
    const now = Date.now();
    const event = await db.campusEvent.create({
      data: {
        title: `Safari etkinlik ${randomUUID()}`,
        description: 'Örnek test etkinliği',
        location: 'Kampüs',
        startsAt: new Date(now - 60_000),
        endsAt: new Date(now + 3_600_000),
        capacity: 10,
        status: 'PUBLISHED',
        createdById: student.id,
        reviewedById: student.id,
        reviewedAt: new Date(now),
        departments: { create: { departmentId: membership.departmentId } },
      },
    });
    const context = await browser.newContext({ ...IPHONE });
    try {
      const page = await context.newPage();
      await login(page, 'student');
      await page.goto(`/etkinlikler/${event.id}`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Katılıyorum' }).click();
      await expect(page.getByLabel('Altı haneli katılım kodu')).toBeVisible();
      await page.goto('/ders-rehberi', { waitUntil: 'networkidle' });
      await page.getByRole('combobox', { name: 'Ders türü', exact: true }).selectOption('elective');
      await page.getByRole('button', { name: 'Filtrele', exact: true }).click();
      await expect(page).toHaveURL(/kind=elective/);
      await expect(page.locator('article').first()).toBeVisible();
    } finally {
      await context.close();
      await db.campusEventRegistration.deleteMany({
        where: { userId: student.id, eventId: event.id },
      });
      await db.campusEvent.delete({ where: { id: event.id } });
    }
  });
});

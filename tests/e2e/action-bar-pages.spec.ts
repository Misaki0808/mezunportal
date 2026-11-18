import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, test, type Page } from './fixture';
import { loginAs } from './login';
import { PrismaClient } from '../../src/generated/prisma/client';

/**
 * Telefonda eylem çubuğu HER ZAMAN ekranın alt şeridinde, alt gezinmenin hemen üstündedir (kart 453, R2 455 B4: `sticky`
 * kendi üst kabının sonunu geçemediği için sayfa sonunda çubuk 96–120 px yukarıda kalıyor, toast düğmeleri örtüyordu). Her
 * gerçek çubuklu sayfada: (1) kaydırma konumu ne olursa olsun çubuk aynı yerde, alt gezinmeyi örtmez ve ona bitişik; (2) sayfa
 * sonunda hiçbir kontrol çubuğun altında kalmaz; (3) dört toast'lık yığın çubuğun HİÇBİR düğmesini örtmez (son konumda
 * `elementFromPoint` + kutu kesişimi). Ekran klavyesi açıkken çubuk akışa döner (`html[data-keyboard=open]`).
 * Toast kutuları, gerçek toast bölgesine eklenen taklit kutulardır (toast'ı sayfa başına gerçek eylemle çıkarmak mümkün
 * değil, ürün koduna test kancası eklenmedi); bölge, konumu ve yığma düzeni gerçektir.
 * Kart 477: eskiden `.sticky-actions` kullanan formlar da (deneyim, rıza, gizlilik, görüşme geri bildirimi, bildirim tercihleri,
 * CV inceleme) bu turdadır. `/onay` rıza öncesi ekrandır (alt gezinme yok): çubuk ekranın dibinde durur.
 */
type Entry = {
  persona: 'student' | 'alumniMentor' | 'systemAdmin' | 'consentPending';
  name: string;
  path: string | ((page: Page) => Promise<string>);
  /** Sayfa açıldıktan sonra çubuğu görünür kılan hazırlık. */
  setup?: (page: Page) => Promise<void>;
};
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const seededAppointments: string[] = [];
const seededUploads: string[] = [];
test.afterAll(async () => {
  if (seededAppointments.length)
    await db.appointment.deleteMany({ where: { id: { in: seededAppointments } } });
  if (seededUploads.length) await db.cvUpload.deleteMany({ where: { id: { in: seededUploads } } });
  await db.$disconnect();
});
/**
 * Ayrıştırılmış bir CV (inceleme ekranı, "Seçilenleri uygula" çubuğu). Çalışan iş kuyruğu bu testte yok: sonuç, işin
 * üreteceği biçimde (`PARSED`) veritabanına konur (profile-cv.spec.ts gibi). CV yükleme formu e2e ortamında kapalıdır
 * (ayrıştırıcı yok), o çubuk birim testiyle (`cv.test.tsx`) sınanır.
 */
const cvReviewPage = async () => {
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  await db.cvUpload.deleteMany({ where: { userId: student.id } });
  const upload = await db.cvUpload.create({
    data: {
      userId: student.id,
      storageKey: `cv/${student.id}/e2e-action-bar.pdf`,
      byteSize: 100,
      pageCount: 1,
      status: 'PARSED',
      parsedJson: {
        profile: {
          headline: 'Yönetim Bilişim Sistemleri öğrencisi',
          summary: null,
          city: 'İstanbul',
        },
        education: [
          {
            institution: 'E2E Üniversitesi',
            level: 'BACHELOR',
            fieldOfStudy: 'Yönetim Bilişim Sistemleri',
            startDate: '2022-09',
            endDate: null,
            isCurrent: true,
          },
        ],
        positions: [],
        skills: ['TypeScript'],
        languages: [{ name: 'İngilizce', level: 'B2' }],
        certifications: [],
      },
    },
  });
  seededUploads.push(upload.id);
  return '/profil/cv';
};
/** Öğrencinin yanıtlamadığı geçmiş bir görüşme (geri bildirim formu); kayıt testten sonra silinir. */
const feedbackPage = async () => {
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const mentor = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const now = Date.UTC(2000, 0, 1) + Math.floor(Math.random() * 300) * 86400000;
  const appointment = await db.appointment.create({
    data: {
      mentorId: mentor.id,
      menteeId: student.id,
      startsAt: new Date(now - 3 * 3600000),
      endsAt: new Date(now - 2 * 3600000),
      expiresAt: new Date(now - 4 * 3600000),
      decidedAt: new Date(now - 5 * 3600000),
      mode: 'ONLINE',
      status: 'CONFIRMED',
    },
  });
  seededAppointments.push(appointment.id);
  return `/hesap/gorusme/${appointment.id}`;
};
/** Rıza vermemiş akademisyen: ilk girişte `/onay` açılır (a11y turundaki gibi). */
async function signInConsentPending(page: Page) {
  await page.goto('/giris/test?persona=academic');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/onay/);
}
const firstLink = (list: string, selector: string) => async (page: Page) => {
  await page.goto(list, { waitUntil: 'networkidle' });
  return (await page.locator(selector).first().getAttribute('href'))!;
};
const PAGES: Entry[] = [
  { persona: 'student', name: 'başlangıç', path: '/baslangic' },
  { persona: 'student', name: 'iş arayan ayarı', path: '/hesap/staj-ariyorum' },
  {
    persona: 'student',
    name: 'randevu seçici',
    path: firstLink('/mentorlar', 'a[href^="/randevu-al/"]'),
  },
  {
    persona: 'student',
    name: 'etkinlik detayı',
    path: firstLink('/etkinlikler', 'a[href^="/etkinlikler/"]'),
  },
  { persona: 'alumniMentor', name: 'mentor ayarları', path: '/mentor/ayarlar' },
  { persona: 'alumniMentor', name: 'ilan editörü', path: '/ilanlar/yeni' },
  { persona: 'alumniMentor', name: 'referans', path: '/referans/yeni' },
  { persona: 'systemAdmin', name: 'sözlük birleştirme', path: '/yonetim/sozlukler/birlestir' },
  // Kart 477: eskiden `.sticky-actions` kullananlar.
  { persona: 'student', name: 'deneyim formu', path: '/deneyim/yeni' },
  { persona: 'student', name: 'gizlilik (görünürlük)', path: '/hesap/gizlilik' },
  { persona: 'student', name: 'bildirim tercihleri', path: '/hesap/bildirimler' },
  { persona: 'student', name: 'görüşme geri bildirimi', path: feedbackPage },
  { persona: 'student', name: 'CV inceleme (seçilenleri uygula)', path: cvReviewPage },
  { persona: 'consentPending', name: 'rıza ekranı (alt gezinme yok)', path: '/onay' },
];

type Box = { x: number; y: number; width: number; height: number };
const FAKE = 'data-r1-fake-toast';

/** Çubuk ve alt gezinme geometrisi (yalnız okur). */
function geometry(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-action-bar]')!.getBoundingClientRect();
    // Rıza öncesi ekranda alt gezinme yok: çubuk ekranın dibine iner (güvenli alan dışında boşluk yok).
    const nav = document.querySelector('[data-bottom-nav]');
    return {
      barTop: bar.top,
      barBottom: bar.bottom,
      barHeight: bar.height,
      navTop: nav ? nav.getBoundingClientRect().top : innerHeight,
      scrollable: document.documentElement.scrollHeight - innerHeight,
    };
  });
}

/** Çubuğun dışındaki görünür kontrollerden çubuğun altında kalan var mı? */
function hiddenUnderBar(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-action-bar]')!;
    const frame = bar.closest('[data-action-bar-frame]') ?? bar;
    const b = bar.getBoundingClientRect();
    const nav = document.querySelector('[data-bottom-nav]');
    return [...document.querySelectorAll('a[href], button, input, select, textarea')]
      .filter((el) => !frame.contains(el) && !nav?.contains(el))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          s.visibility !== 'hidden' &&
          s.display !== 'none' &&
          r.top < b.bottom - 1 &&
          r.bottom > b.top + 1 &&
          r.left < b.right &&
          r.right > b.left &&
          r.bottom > 0 &&
          r.top < innerHeight
        );
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`);
  });
}

/** Gerçek toast bölgesine dört taklit kutu ekler; kutuların ekran konumlarını döner. */
function addFakeToasts(page: Page) {
  return page.evaluate((attr) => {
    const region = document.querySelector('[role="region"][aria-label="Bildirimler"]')!;
    const host = region.querySelector('[role="status"]')!;
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.setAttribute(attr, '');
      el.textContent = `R1 yerleşim ölçümü ${i + 1}`;
      el.style.cssText =
        'pointer-events:auto;min-height:56px;padding:12px 16px;border-radius:12px;background:#222;color:#fff;';
      host.appendChild(el);
    }
    for (const el of host.querySelectorAll(`[${attr}]`)) {
      const r = el.getBoundingClientRect();
      boxes.push({ x: r.x, y: r.y, width: r.width, height: r.height });
    }
    return boxes;
  }, FAKE);
}

/** Çubuktaki her düğme/bağlantı: 9 noktada üstteki öğe kendisi mi, toast kutularıyla kesişim var mı? */
function barControls(page: Page, toasts: Box[]) {
  return page.evaluate((boxes) => {
    const bar = document.querySelector('[data-action-bar]')!;
    return [...bar.querySelectorAll('button, a')].map((el) => {
      const r = el.getBoundingClientRect();
      const points = [0.1, 0.5, 0.9].flatMap((fx) =>
        [0.1, 0.5, 0.9].map((fy) => [r.x + r.width * fx, r.y + r.height * fy] as const),
      );
      const covered = points.filter(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('button, a') !== el,
      ).length;
      const overlap = boxes.some(
        (t) =>
          t.x < r.x + r.width &&
          t.x + t.width > r.x &&
          t.y < r.y + r.height &&
          t.y + t.height > r.y,
      );
      return {
        name: (el.textContent ?? '').trim().slice(0, 40),
        y: Math.round(r.y),
        covered,
        overlap,
        toastBottom: Math.round(Math.max(...boxes.map((t) => t.y + t.height))),
      };
    });
  }, toasts);
}

const VARIANTS = [
  { name: '390×844', width: 390, height: 844, zoom: false },
  { name: '320×640', width: 320, height: 640, zoom: false },
  { name: '390×844, yazı %200', width: 390, height: 844, zoom: true },
];

for (const variant of VARIANTS) {
  test(`${variant.name}: çubuk her kaydırma konumunda aynı yerde, içerik altında kalmaz, dört toast örtmez`, async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await page.setViewportSize({ width: variant.width, height: variant.height });
    let current: Entry['persona'] | null = null;
    const report: string[] = [];
    for (const entry of PAGES) {
      if (current !== entry.persona) {
        if (entry.persona === 'consentPending') await signInConsentPending(page);
        else await loginAs(page, entry.persona);
        current = entry.persona;
      }
      const target = typeof entry.path === 'string' ? entry.path : await entry.path(page);
      await page.goto(target, { waitUntil: 'networkidle' });
      await entry.setup?.(page);
      if (variant.zoom) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await expect(page.locator('[data-action-bar]'), `${entry.name}: çubuk var`).toHaveCount(1);
      await page.waitForTimeout(400);

      // (1) kaydırma konumundan bağımsız aynı yer; alt gezinmeye bitişik, örtmez.
      const top = await geometry(page);
      const positions = [0, Math.round(top.scrollable / 2), top.scrollable];
      const seen: Awaited<ReturnType<typeof geometry>>[] = [];
      for (const y of positions) {
        await page.evaluate((to) => window.scrollTo(0, to), y);
        await page.waitForTimeout(250);
        seen.push(await geometry(page));
      }
      for (const g of seen) {
        expect
          .soft(
            Math.abs(g.barBottom - seen[0]!.barBottom),
            `${entry.name}: çubuk altı kaydırmayla oynar`,
          )
          .toBeLessThanOrEqual(0.6);
        expect
          .soft(g.barBottom, `${entry.name}: çubuk alt gezinmeyi örter`)
          .toBeLessThanOrEqual(g.navTop + 0.6);
        expect
          .soft(g.navTop - g.barBottom, `${entry.name}: çubuk alt gezinmeden uzak`)
          .toBeLessThanOrEqual(variant.zoom ? 40 : 20);
      }
      // (2) sayfa sonu: çubuğun altında kalan kontrol yok.
      const hidden = await hiddenUnderBar(page);
      expect.soft(hidden, `${entry.name}: sayfa sonunda çubuğun altında kalan kontrol`).toEqual([]);
      // (3) dört toast.
      const toasts = await addFakeToasts(page);
      expect(toasts).toHaveLength(4);
      const controls = await barControls(page, toasts);
      expect(controls.length, `${entry.name}: çubukta düğme var`).toBeGreaterThan(0);
      for (const c of controls) {
        expect
          .soft(
            c.overlap,
            `${entry.name}: toast altı ${c.toastBottom} "${c.name}" (y ${c.y}) ile kesişmemeli`,
          )
          .toBe(false);
        expect.soft(c.covered, `${entry.name}: "${c.name}" ${c.covered}/9 nokta örtülü`).toBe(0);
      }
      report.push(
        `${entry.name}: çubuk altı ${Math.round(seen[2]!.barBottom)} / gezinme ${Math.round(seen[2]!.navTop)}`,
      );
    }
    test.info().annotations.push({ type: 'ölçüm', description: report.join(' | ') });
    // `ACTION_BAR_OUT=<klasör>`: sayfa başına ölçüm satırları (kanıt için; verilmezse yazılmaz).
    const out = process.env.ACTION_BAR_OUT;
    if (out) {
      mkdirSync(out, { recursive: true });
      const file = `${process.env.ACTION_BAR_TAG ?? 'kosu'}-${variant.name.replace(/[^\w]+/g, '_')}.txt`;
      writeFileSync(path.join(out, file), report.join('\n') + '\n');
    }
  });
}

test('ekran klavyesi açıkken çubuk akışa döner; kapanınca yeniden sabitlenir; ana alan dolgusu çubuğu sayar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, 'alumniMentor');
  await page.goto('/mentor/ayarlar', { waitUntil: 'networkidle' });
  const state = () =>
    page.evaluate(() => {
      const frame = document.querySelector('[data-action-bar-frame]')!;
      const bar = document.querySelector('[data-action-bar]')!.getBoundingClientRect();
      const nav = document.querySelector('[data-bottom-nav]')!.getBoundingClientRect();
      return {
        frame: getComputedStyle(frame).position,
        padding: parseFloat(getComputedStyle(document.querySelector('main')!).paddingBottom),
        barHeight: bar.height,
        navHeight: nav.height,
      };
    });
  const closed = await state();
  expect(closed.frame).toBe('fixed');
  // Ana alanın alt dolgusu alt gezinme + çubuk kadar: sayfa sonunda hiçbir içerik çubuğun altında kalmaz.
  expect(closed.padding).toBeGreaterThanOrEqual(closed.barHeight + closed.navHeight - 1);
  await page.evaluate(() => (document.documentElement.dataset.keyboard = 'open'));
  expect(await state()).toMatchObject({ frame: 'static' });
  await page.evaluate(() => delete document.documentElement.dataset.keyboard);
  expect(await state()).toMatchObject({ frame: 'fixed' });
});

test('1440: çubuk masaüstünde kapsız, eskisi gibi akışta; sabit değil, ana alan dolgusu 0', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, 'alumniMentor');
  await page.goto('/mentor/ayarlar', { waitUntil: 'networkidle' });
  const state = await page.evaluate(() => {
    const frame = document.querySelector('[data-action-bar-frame]')!;
    const bar = document.querySelector('[data-action-bar]')!;
    return {
      frame: getComputedStyle(frame).display,
      bar: getComputedStyle(bar).position,
      // lg'de ana alan alt dolgusu sıfır: çubuk akışta, ek boşluk yok.
      padding: getComputedStyle(document.querySelector('main')!).paddingBottom,
    };
  });
  expect(state).toEqual({ frame: 'contents', bar: 'static', padding: '0px' });
});

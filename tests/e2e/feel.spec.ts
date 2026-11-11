import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '../../src/generated/prisma/client';
import messages from '../../messages/tr.json' with { type: 'json' };

/**
 * Kullanım hissi (kart 207): ana eylemlerde geri bildirim anları 390 px'te ölçülür ve korunur.
 *  - bekleyen düğme: basınca ANINDA `aria-busy` (sunucu eylemi yavaşlatılarak ölçülür)
 *  - çift tıklama: tek istek
 *  - başarı: toast (yönlendirmede de görünür)
 *  - hata sonrası: girilen veri korunur, kararlı hata metni görünür, yakalanmamış hata yok
 *  - düzen zıplaması (CLS) eşiği
 * Sunucu eylemi = `next-action` başlıklı POST; yavaşlatma/kesme `page.route` ile yapılır.
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.use({ viewport: { width: 390, height: 844 } });

const SERVER_ERROR = messages.errors.codes.SERVER_UNEXPECTED;
const SLOW_MS = 900;

type Persona = 'student' | 'alumniMentor' | 'systemAdmin';
async function login(page: Page, persona: Persona) {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay|yonetim)/);
  await page.waitForURL(/\/onay/, { timeout: 5000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle');
  const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  if (page.url().includes('/onay'))
    await required
      .first()
      .waitFor({ timeout: 8000 })
      .catch(() => undefined);
  if ((await required.count()) >= 2) {
    await required.nth(0).check();
    await required.nth(1).check();
    await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
    await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
  }
  await page
    .waitForURL((url) => !url.pathname.startsWith('/onay'), { timeout: 10_000 })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle');
}

/** Sunucu eylemi POST'larını sayar, yavaşlatır ya da keser. */
async function watchActions(page: Page) {
  const state = { delay: 0, abort: false, posts: 0, uncaught: [] as string[] };
  page.on('pageerror', (error) => state.uncaught.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.headers()['next-action']) {
      state.posts += 1;
      if (state.abort) return route.abort('failed');
      if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
    }
    await route.continue();
  });
  return state;
}

/**
 * Bekleyen durumun ANINDA göründüğünü doğrular (eylem yavaşken; yoksa düğme "donmuş" hissi verir). Bekleyen düğmenin adı
 * değişebilir ("Katılıyorum" → "Kaydediliyor…"): ada değil `aria-busy` taşıyan düğmeye bakılır.
 */
async function expectPendingNow(page: Page) {
  await expect
    .soft(
      page.locator('button[aria-busy="true"]').first(),
      'basınca anında bekleyen düğme (aria-busy)',
    )
    .toBeVisible({ timeout: 500 });
}

test.describe('kullanım hissi: geri bildirim anları (390)', () => {
  test('etkinliğe katıl: bekleyen düğme, tek istek, başarı bildirimi; hatada kod korunur', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const student = await db.user.findUniqueOrThrow({
      where: { email: 'student@test.mezunportal.local' },
    });
    await db.campusEventRegistration.deleteMany({ where: { userId: student.id } });
    try {
      await login(page, 'student');
      const state = await watchActions(page);
      await page.goto('/etkinlikler', { waitUntil: 'networkidle' });
      await page.goto(
        (await page.locator('a[href^="/etkinlikler/"]').first().getAttribute('href'))!,
        {
          waitUntil: 'networkidle',
        },
      );
      state.delay = SLOW_MS;
      const join = page.getByRole('button', { name: 'Katılıyorum' });
      await join.dblclick();
      await expectPendingNow(page);
      await expect.soft(page.getByText('Kaydın alındı.')).toBeVisible();
      expect.soft(state.posts, 'çift tıklama tek istek').toBe(1);
      // Hata sonrası: girilen kod korunur, kararlı hata metni görünür, yakalanmamış hata yok.
      state.delay = 0;
      state.abort = true;
      const code = page.getByLabel('Altı haneli katılım kodu');
      await code.fill('123456');
      await page.getByRole('button', { name: 'Katılımı doğrula' }).click();
      await expect.soft(page.getByText(SERVER_ERROR)).toBeVisible();
      await expect.soft(code).toHaveValue('123456');
      expect.soft(state.uncaught, 'yakalanmamış hata').toEqual([]);
    } finally {
      await db.campusEventRegistration.deleteMany({ where: { userId: student.id } });
    }
  });

  test('bildirim tercihi kaydet: bekleyen düğme, başarı bildirimi, hatada seçim korunur', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, 'student');
    const state = await watchActions(page);
    await page.goto('/hesap/bildirimler', { waitUntil: 'networkidle' });
    // İlk ETKİN anahtar (zorunlu bildirimler kapalı olabilir).
    const toggle = page.locator('input[role="switch"]:not(:disabled)').first();
    const initial = await toggle.isChecked();
    await toggle.click();
    state.delay = SLOW_MS;
    const save = page.getByRole('button', { name: messages.notifications.save });
    await save.click();
    await expectPendingNow(page);
    await expect.soft(page.getByText(messages.notifications.saved)).toBeVisible();
    // Hata: seçim değiştirilir, kayıt kesilir → seçim ekranda kalır, hata görünür.
    state.delay = 0;
    state.abort = true;
    await toggle.click();
    const changed = await toggle.isChecked();
    await save.click();
    await expect.soft(page.getByText(SERVER_ERROR)).toBeVisible();
    expect.soft(await toggle.isChecked(), 'hata sonrası seçim korunur').toBe(changed);
    expect.soft(state.uncaught, 'yakalanmamış hata').toEqual([]);
    // Eski haline döndür.
    state.abort = false;
    if ((await toggle.isChecked()) !== initial) await toggle.click();
    if ((await toggle.isChecked()) !== initial) await toggle.click();
    await save.click();
    await expect(page.getByText(messages.notifications.saved).first()).toBeVisible();
  });

  test('profil kaydet: bekleyen düğme, "Profilin güncellendi" bildirimi; hatada çekmece ve metin korunur', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const student = await db.user.findUniqueOrThrow({
      where: { email: 'student@test.mezunportal.local' },
    });
    const before = await db.profile.findUnique({
      where: { userId: student.id },
      select: { headline: true },
    });
    try {
      await login(page, 'student');
      const state = await watchActions(page);
      await page.goto('/profil', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: messages.profile.my.editShortcut }).first().click();
      const headline = page.getByLabel(messages.profile.fields.headline);
      await headline.fill(`Deneme ${randomUUID().slice(0, 6)}`);
      state.delay = SLOW_MS;
      const save = page.getByRole('button', { name: messages.profile.my.save, exact: true });
      await save.click();
      await expectPendingNow(page);
      await expect.soft(page.getByText('Profilin güncellendi.')).toBeVisible();
      // Hata: çekmece açık kalır, yazılan metin silinmez.
      await page.getByRole('button', { name: messages.profile.my.editShortcut }).first().click();
      state.delay = 0;
      state.abort = true;
      const typed = `Kesilen ${randomUUID().slice(0, 6)}`;
      await headline.fill(typed);
      await page.getByRole('button', { name: messages.profile.my.save, exact: true }).click();
      await expect.soft(page.getByText(SERVER_ERROR)).toBeVisible();
      await expect.soft(headline).toHaveValue(typed);
      expect.soft(state.uncaught, 'yakalanmamış hata').toEqual([]);
    } finally {
      await db.profile.updateMany({
        where: { userId: student.id },
        data: { headline: before?.headline ?? null },
      });
    }
  });

  test('yönetim onay: gerekçe yokken kapalı sebepli; hatada gerekçe korunur; başarıda bildirim ve temizlik', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const pending = await db.campusEvent.findFirst({
      where: { title: { contains: 'inceleme bekliyor' } },
    });
    test.skip(!pending, 'Faz 2 deneme verisi (db:seed) gerekli');
    try {
      await login(page, 'systemAdmin');
      const state = await watchActions(page);
      await page.goto('/yonetim/etkinlikler', { waitUntil: 'networkidle' });
      const row = page.locator('li').filter({ hasText: pending!.title });
      const approve = row.getByRole('button', { name: 'Onayla' });
      await expect(approve).toBeDisabled();
      await expect(approve, 'kapalı düğmenin sebebi bağlı').toHaveAccessibleDescription(
        messages.campusEvents.reasonHint,
      );
      const reason = page.getByLabel(messages.campusEvents.reason);
      await reason.fill('Uygun bulundu');
      state.abort = true;
      await approve.click();
      await expect.soft(page.getByText(SERVER_ERROR).first()).toBeVisible();
      await expect.soft(reason, 'hata sonrası gerekçe korunur').toHaveValue('Uygun bulundu');
      state.abort = false;
      state.delay = SLOW_MS;
      await approve.dblclick();
      await expectPendingNow(page);
      await expect.soft(page.getByText('Etkinlik yayınlandı.')).toBeVisible();
      await expect.soft(reason, 'başarıdan sonra gerekçe temizlenir').toHaveValue('');
      expect(state.posts, 'çift tıklama tek istek (hatalı denemeden sonra 1)').toBe(2);
    } finally {
      await db.campusEvent.update({ where: { id: pending!.id }, data: { status: 'PENDING' } });
    }
  });

  test('ilan ver: bekleyen düğme, yönlendirmede de görünen başarı bildirimi; hatada form korunur', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const title = `Hissi ${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    try {
      await login(page, 'alumniMentor');
      const state = await watchActions(page);
      await page.goto('/ilanlar/yeni', { waitUntil: 'networkidle' });
      await page.getByLabel('Pozisyon adı').fill(title);
      await page.getByLabel('Kurum adı').fill('Örnek Teknoloji');
      await page.getByRole('button', { name: 'Devam et' }).click();
      await page
        .getByLabel('Açıklama')
        .fill(
          'Öğrenciler için ekip çalışması ve yazılım geliştirme odaklı örnek bir staj fırsatıdır.',
        );
      await page.getByLabel('Konum', { exact: true }).fill('İstanbul');
      const deadline = new Date();
      deadline.setUTCDate(deadline.getUTCDate() + 20);
      await page.getByLabel('Son başvuru tarihi').fill(deadline.toISOString().slice(0, 10));
      await page
        .getByRole('checkbox', { name: /Yönetim Bilişim Sistemleri/ })
        .first()
        .check();
      await page.getByRole('checkbox', { name: 'Yazılım geliştirme' }).check();
      await page.getByLabel('HTTPS başvuru bağlantısı').fill('https://example.org/staj');
      await page.getByRole('button', { name: 'Devam et' }).click();
      // Hata: gönderim kesilir → ilan formu ekranda, veri korunur, hata görünür, yönlendirme yok.
      state.abort = true;
      await page.getByRole('button', { name: 'İncelemeye gönder' }).click();
      await expect.soft(page.getByText(SERVER_ERROR).first()).toBeVisible();
      expect.soft(page.url()).toContain('/ilanlar/yeni');
      expect.soft(state.uncaught, 'yakalanmamış hata').toEqual([]);
      // Başarı: yavaş eylem → bekleyen düğme, sonra yönlendirme + toast.
      state.abort = false;
      state.delay = SLOW_MS;
      const send = page.getByRole('button', { name: 'İncelemeye gönder' });
      await send.dblclick();
      await expectPendingNow(page);
      await page.waitForURL('**/ilanlarim');
      await expect.soft(page.getByText('İlanın incelemeye gönderildi.')).toBeVisible();
    } finally {
      const record = await db.jobPosting.findFirst({ where: { title }, select: { id: true } });
      if (record) {
        await db.pointEntry.deleteMany({
          where: { sourceType: 'JOB_POSTING', sourceId: record.id },
        });
        await db.jobPosting.deleteMany({ where: { id: record.id } });
      }
    }
  });
});

test.describe('düzen zıplaması (CLS, 390)', () => {
  const CLS_BUDGET = 0.1; // Google "iyi" eşiği
  async function clsOf(page: Page, path: string) {
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    return page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  }

  test('ana ekranlar yüklenirken düzen zıplamaz', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[])
          if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await login(page, 'student');
    const report: Record<string, number> = {};
    for (const path of [
      '/hesap',
      '/profil',
      '/ilanlar',
      '/sirketler',
      '/mulakat-sorulari',
      '/basvuru-takvimi',
      '/ders-rehberi',
      '/etkinlikler',
      '/hesap/bildirimler',
    ]) {
      report[path] = Number((await clsOf(page, path)).toFixed(4));
      expect
        .soft(report[path], `${path}: CLS ${report[path]} (bütçe ${CLS_BUDGET})`)
        .toBeLessThan(CLS_BUDGET);
    }
    test.info().annotations.push({ type: 'CLS', description: JSON.stringify(report) });
    process.stdout.write(`CLS ${JSON.stringify(report)}\n`);
  });
});

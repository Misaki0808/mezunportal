import { expect, test, type Page } from '@playwright/test';

// Faz 2 deneme verisiyle (pnpm db:seed → prisma/seed-phase2.ts) uçtan uca gezinti (P2-14): kullanıcının test turunda ilk açacağı
// ekranların örnek içerikle dolu geldiğini ve gizlilik kurallarının (K-07, yazar adı, incelemedeki kayıt) ekranda korunduğunu doğrular.
const SEEDED = {
  postings: [
    'Veri Analizi Stajyeri (örnek ilan)',
    'İş Analizi Stajyeri (örnek ilan)',
    'Junior ERP Danışmanı (örnek ilan)',
  ],
  pendingPosting: 'Ürün Yönetimi Stajyeri (inceleme bekliyor)',
  draftPosting: 'Dijital Pazarlama Stajyeri (taslak)',
  event: 'YBS Kariyer Sohbeti (deneme etkinliği)',
  pendingEvent: 'CV Atölyesi (inceleme bekliyor)',
  company: 'Örnek Yazılım A.Ş.',
  sharedQuestion: 'Neden bu şirketi seçtin?',
};

async function login(page: Page, persona: 'student' | 'departmentAdmin') {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  const consent = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await consent.nth(0).check();
  await consent.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
}
const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test.use({ viewport: { width: 390, height: 844 } });

test('öğrenci: ilan, şirket, soru bankası, takvim ve etkinlik örnek içerikle dolu; yazar adı ve e-posta yok', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, 'student');

  // İlanlar: üç yayında örnek ilan; incelemedeki ve taslak ilan öğrenciye görünmez.
  await page.goto('/ilanlar', { waitUntil: 'networkidle' });
  for (const title of SEEDED.postings) await expect(page.getByText(title).first()).toBeVisible();
  await expect(page.getByText(SEEDED.pendingPosting)).toHaveCount(0);
  await expect(page.getByText(SEEDED.draftPosting)).toHaveCount(0);
  await noOverflow(page);
  await page.getByText(SEEDED.postings[0]!).first().click();
  await expect(page.getByText(SEEDED.company).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('alumni-mentor@');
  await expect(page.locator('body')).not.toContainText('Mert Yıldız'); // D7: yazar adı ilanda yok

  // Şirket sayfası: örnek şirket aranır/listelenir ve açılır.
  await page.goto('/sirketler', { waitUntil: 'networkidle' });
  await expect(page.getByText(SEEDED.company).first()).toBeVisible();
  await page.getByText(SEEDED.company).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Örnek Yazılım');
  await noOverflow(page);

  // Mülakat soru bankası: en az üç farklı yazardan ortak soru görünür (k-anonimlik eşiği).
  await page.goto('/mulakat-sorulari', { waitUntil: 'networkidle' });
  await expect(page.getByText(SEEDED.sharedQuestion).first()).toBeVisible();
  await noOverflow(page);

  // Başvuru takvimi sayfası hatasız açılır.
  await page.goto('/basvuru-takvimi', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await noOverflow(page);

  // Etkinlikler: yayında etkinlik görünür, incelemedeki görünmez.
  await page.goto('/etkinlikler', { waitUntil: 'networkidle' });
  await expect(page.getByText(SEEDED.event).first()).toBeVisible();
  await expect(page.getByText(SEEDED.pendingEvent)).toHaveCount(0);
  await noOverflow(page);
});

test('bölüm yöneticisi: incelemedeki örnek ilan ve etkinlik moderasyon ekranında bekler', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page, 'departmentAdmin');
  await page.goto('/yonetim/ilanlar', { waitUntil: 'networkidle' });
  await expect(page.getByText(SEEDED.pendingPosting).first()).toBeVisible();
  await noOverflow(page);
  await page.goto('/yonetim/etkinlikler', { waitUntil: 'networkidle' });
  await expect(page.getByText(SEEDED.pendingEvent).first()).toBeVisible();
  await noOverflow(page);
});

import { loginAs } from './login';
import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { waitForHydratedControl, waitForHydratedForm } from './hydration';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'serial' });
/** Sayfa yüklenince hidratasyon biter (ağ durulur); öncesinde tıklanan form/düğme sessizce işlevsiz kalır. */
const login = loginAs;
test('iletişim: talep → onay → alanları gör → geri al → alanlar kaybolur', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000); // İki oturum ve veri dökümü paralel derlemede 30 saniyeyi aşabilir.
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const alumni = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  await db.contactRequest.deleteMany({
    where: {
      OR: [
        { requesterId: student.id, targetId: alumni.id },
        { requesterId: alumni.id, targetId: student.id },
      ],
    },
  });
  await db.user.update({ where: { id: alumni.id }, data: { phone: '+90 555 123 45 67' } });
  const second = await browser.newContext();
  const target = await second.newPage();
  try {
    await page.goto('/iletisim-iste/olmayan-kisi');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/giris\?donus=/);
    await page.goto('/hesap/hesabi-sil');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/giris\?donus=/);
    await login(page, 'student');
    await login(target, 'alumniMentor');
    await target.goto('/hesap/gizlilik');
    await waitForHydratedForm(target, 'Kaydet');
    for (const label of ['E-posta', 'Telefon']) {
      await target.getByLabel(label, { exact: true }).selectOption('ON_APPROVED_REQUEST');
    }
    await target.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(
      target.getByRole('status').filter({ hasText: 'Değişikliklerin kaydedildi.' }),
    ).toBeVisible();
    await page.goto(`/iletisim-iste/${student.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('İletişim talebi gönderilemiyor')).toBeVisible();
    await page.goto('/iletisim-iste/olmayan-kisi');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('İletişim talebi gönderilemiyor')).toBeVisible();
    await page.goto(`/iletisim-iste/${alumni.id}`);
    await waitForHydratedForm(page, 'Talep gönder');
    await expect(page.getByRole('heading', { name: new RegExp(alumni.name) })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Sosyal bağlantılar' })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'E-posta', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Telefon', exact: true }).check();
    await page.getByLabel('Kısa not').fill('Staj deneyimin hakkında danışmak istiyorum.');
    await page.getByRole('button', { name: 'Talep gönder', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Talebin gönderildi.' })).toBeVisible();
    await page.getByRole('link', { name: 'Taleplerime git' }).click();
    await expect(page.locator('body')).not.toContainText(alumni.email);
    await target.goto('/hesap/iletisim');
    await waitForHydratedControl(target, 'Onayla');
    await target.getByRole('button', { name: 'Onayla', exact: true }).click();
    await expect(target.getByText('Talep güncellendi.').first()).toBeVisible();
    await expect(target.locator('body')).not.toContainText(student.email);
    await page.reload();
    await expect(page.getByText(alumni.email, { exact: true })).toBeVisible();
    await expect(page.getByText('+90 555 123 45 67', { exact: true })).toBeVisible();
    await target.getByRole('button', { name: 'Onayı geri al', exact: true }).click();
    await target
      .getByRole('dialog')
      .getByRole('button', { name: 'Onayı geri al', exact: true })
      .click();
    await expect(target.getByRole('dialog')).not.toBeVisible();
    await page.reload();
    await expect(page.getByText('Onay geri alındı', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(alumni.email);
    await expect(page.locator('body')).not.toContainText('+90 555 123 45 67');
    // Veri dökümü karşı tarafın gizli iletişimini taşımaz.
    await page.goto('/hesap/veriler');
    await waitForHydratedControl(page, 'Verilerimi indir');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Verilerimi indir' }).click();
    const file = await (await downloaded).path();
    expect(file).toBeTruthy();
    const json = await readFile(file!, 'utf8');
    expect(json).toContain(student.email);
    expect(json).not.toContain(alumni.email);
    expect(json).not.toContain('+90 555 123 45 67');
  } finally {
    await second.close();
  }
});
test('zorunlu metin sürümü değişince hesap yeniden onaya yönlenir; isteğe bağlı rıza kapalı kalabilir', async ({
  page,
}) => {
  await login(page, 'student');
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  await db.consent.create({
    data: { userId: student.id, documentType: 'TERMS_OF_USE', version: 'taslak-0', granted: true },
  });
  // --as, onay bekleyen test hesabında /onay'a ulaşır; kendiliğinden rıza vermez.
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), 'mezun-consent-evidence-'));
  try {
    const output = execFileSync(
      'pnpm',
      ['evidence', '/onay', '--as', 'student', '--out', evidenceRoot],
      { env: { ...process.env, APP_ENV: 'test' }, encoding: 'utf8', timeout: 30_000 },
    );
    const report = JSON.parse(output.slice(output.indexOf('{')));
    expect(report.captures).toHaveLength(2);
    expect(report.captures.every((capture: { errors: number }) => capture.errors === 0)).toBe(true);
    const last = await db.consent.findFirstOrThrow({
      where: { userId: student.id, documentType: 'TERMS_OF_USE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(last.version).toBe('taslak-0');
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
  await page.goto('/hesap/gizlilik');
  await page.waitForLoadState('networkidle');
  // Kendi KVKK hakları güncel zorunlu onay olmadan da erişilebilir.
  await expect(page).toHaveURL(/\/hesap\/gizlilik$/);
  await expect(
    page.getByRole('heading', { name: 'İletişim bilgilerin, senin kararın' }),
  ).toBeVisible();
  await page.goto('/hesap');
  await page.waitForLoadState('networkidle');
  // Gidilmek istenen yol dönüş için taşınır (tur #10).
  await expect(page).toHaveURL(/\/onay\?donus=%2Fhesap$/);
  await waitForHydratedForm(page, 'Seçimlerimi kaydet');
  await expect(page.getByRole('heading', { name: 'Onaylarını yenile', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true }).nth(1).check();
  await page
    .getByRole('checkbox', { name: 'Yurt dışına aktarım için açık rıza veriyorum.' })
    .uncheck();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page).toHaveURL(/\/hesap$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('açık yönetim düzeninde eskiyen rıza rol reddi yerine onay çağrısı gösterir', async ({
  page,
}) => {
  // Önceden yetkili halde indirilmiş içeriği değil, tıklama anındaki sunucu kapısını ölç.
  await page.route('**/*', (route) =>
    route.request().headers()['next-router-prefetch'] === '1' ? route.abort() : route.continue(),
  );
  await login(page, 'systemAdmin');
  const admin = await db.user.findUniqueOrThrow({
    where: { email: 'system-admin@test.mezunportal.local' },
  });
  const current = await db.consent.findFirstOrThrow({
    where: { userId: admin.id, documentType: 'TERMS_OF_USE' },
    orderBy: { createdAt: 'desc' },
  });
  try {
    await page.goto('/yonetim');
    await page.waitForLoadState('networkidle');
    await db.consent.create({
      data: { userId: admin.id, documentType: 'TERMS_OF_USE', version: 'taslak-0', granted: true },
    });
    await page.locator('a[href="/yonetim/kullanicilar"]').first().click();
    await page.waitForURL((url) => ['/onay', '/yonetim/kullanicilar'].includes(url.pathname));
    if (new URL(page.url()).pathname !== '/onay') {
      await expect(
        page.getByRole('heading', { name: 'Önce metinleri onaylaman gerekiyor', exact: true }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'Onay ekranına git', exact: true }).click();
    }
    await expect(page).toHaveURL(/\/onay(?:\?.*)?$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  } finally {
    await db.consent.create({
      data: {
        userId: admin.id,
        documentType: 'TERMS_OF_USE',
        version: current.version,
        granted: current.granted,
      },
    });
  }
});

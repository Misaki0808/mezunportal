import { waitForFormReady } from './hydration';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { expect, test } from './fixture';
import { loginAs } from './login';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('seçili sektör adı dar ekranda kesilmez ve seçici erişilebilir boyutta kalır', async ({
  page,
}) => {
  await loginAs(page, 'student');
  await page.goto('/mezunlar');
  const sector = page.getByRole('combobox', { name: 'Sektör' });
  await expect(sector).toBeVisible();
  await waitForFormReady(sector);
  await sector.selectOption({ label: 'Bilişim ve Yazılım' });
  await expect(page).toHaveURL(/sectorId=/);
  // 1024: lg eşiği; eski düzen orada da seçili adı kesiyordu (kullanılabilir 109 px < 168 px).
  for (const width of [320, 360, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    const dimensions = await sector.evaluate((element) => {
      const select = element as HTMLSelectElement;
      const style = getComputedStyle(select);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const text = select.selectedOptions[0]?.textContent ?? '';
      const widest = [...select.options].reduce(
        (maximum, option) => Math.max(maximum, context.measureText(option.text).width),
        0,
      );
      return {
        text,
        textWidth: context.measureText(text).width,
        widest,
        available:
          select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        fontSize: parseFloat(style.fontSize),
        height: select.getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expect(dimensions.text).toBe('Bilişim ve Yazılım');
    expect(dimensions.available, `${width}px: seçili sektör metni`).toBeGreaterThanOrEqual(
      dimensions.textWidth,
    );
    expect(dimensions.available, `${width}px: en uzun sektör metni`).toBeGreaterThanOrEqual(
      dimensions.widest,
    );
    expect(dimensions.fontSize).toBeGreaterThanOrEqual(16);
    expect(dimensions.height).toBeGreaterThanOrEqual(44);
    expect(dimensions.overflow).toBeLessThanOrEqual(1);
    if (width === 390)
      await test.info().attach('sektor-390', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
  }
});

test('mezun açıkça katılır, aynı üniversitenin öğrencisi bulur; kapatınca kaybolur', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const alumnus = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.alumniMentor.email },
    select: { id: true, name: true },
  });
  await db.profile.upsert({
    where: { userId: alumnus.id },
    create: { userId: alumnus.id, alumniDirectoryVisible: false, onboardingStep: 'VISIBILITY' },
    update: { alumniDirectoryVisible: false, onboardingStep: 'VISIBILITY' },
  });
  await loginAs(page, 'alumniMentor');
  await page.goto('/baslangic');
  const checkbox = page.getByRole('checkbox', { name: /Mezun rehberinde görün/ });
  await expect(checkbox.locator('xpath=ancestor::section[1]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(page.getByText('Tercihin kaydedildi.')).toBeVisible();
  await page.goto('/profil');
  await expect(checkbox).toBeChecked();
  await page.context().clearCookies();
  await loginAs(page, 'student');
  await page.goto('/mezunlar');
  await expect(page.getByRole('heading', { name: alumnus.name })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.context().clearCookies();
  await loginAs(page, 'alumniMentor');
  await page.goto('/profil');
  await expect(checkbox.locator('xpath=ancestor::section[1]')).toHaveAttribute(
    'data-hydrated',
    'true',
  );
  await checkbox.uncheck();
  await expect(page.getByText('Tercihin kaydedildi.')).toBeVisible();
  await page.context().clearCookies();
  await loginAs(page, 'student');
  await page.goto('/mezunlar');
  await expect(page.getByRole('heading', { name: alumnus.name })).toHaveCount(0);
});

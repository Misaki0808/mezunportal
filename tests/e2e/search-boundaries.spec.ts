import { loginAs } from './login';
import { expect, test, type Page } from './fixture';
import { waitForHydratedForm } from './hydration';

const login = (page: Page) => loginAs(page, 'academic');

test('beş geçersiz filtre bağlantısı çökmeden temizleme sunar', async ({ page }) => {
  await login(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const query of [
    '?page=NaN',
    '?page=-1',
    '?page=999999999',
    '?types=ROCKET',
    '?termYear=oops',
  ]) {
    await page.goto(`/deneyimler${query}`);
    await expect(page.getByRole('heading', { name: 'Filtre bağlantısı geçersiz' })).toBeVisible();
    await page.getByRole('link', { name: 'Filtreleri temizle' }).click();
    await expect(page).toHaveURL(/\/deneyimler$/);
    await expect(page.getByRole('heading', { name: 'Deneyimlere bak' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This page couldn’t load' })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('uzun şirket etiketi 360 ve 390 pikselde kısalır, kaldırma erişilebilir kalır', async ({
  page,
}) => {
  await login(page);
  const company = 'W'.repeat(100);
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/deneyimler?company=${company}`);
    const label = page.getByTitle(company);
    const remove = page.getByRole('button', { name: `${company} etiketini kaldır` });
    await expect(label).toBeVisible();
    await expect(remove).toBeVisible();
    const metrics = await page.evaluate(() => ({
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(metrics.scroll).toBe(metrics.viewport);
    const box = await remove.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await label.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    // Filtre uygulanmışken "Filtreler (1)" uzar; arama girdisi 360 px'te 105 px'e düşüyordu: en az 10 rem (160 px) kalır,
    // sığmayan düğme alt satıra iner ama ekrandan taşmaz.
    const search = await page.getByRole('searchbox').boundingBox();
    expect(search!.width, `arama girdisi (${width} px)`).toBeGreaterThanOrEqual(160);
    const filters = await page
      .getByRole('button', { name: /^Filtreler/ })
      .first()
      .boundingBox();
    expect(filters!.x + filters!.width, `Filtreler düğmesi (${width} px)`).toBeLessThanOrEqual(
      width,
    );
  }
  await removeChip(page, company);
});
async function removeChip(page: Page, company: string) {
  await page.getByRole('button', { name: `${company} etiketini kaldır` }).click();
  await expect(page).toHaveURL(/\/deneyimler$/);
}

test('arama yüklenirken düğme kilitlidir', async ({ page }) => {
  await login(page);
  await page.goto('/deneyimler');
  let release!: () => void;
  let seen!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const observed = new Promise<void>((resolve) => {
    seen = resolve;
  });
  await page.route('**/deneyimler?*', async (route) => {
    if (route.request().headers()['rsc'] === '1') {
      seen();
      await blocked;
    }
    await route.continue();
  });
  try {
    await page.getByLabel('Deneyim ara').fill('Teknoloji');
    const submit = page.locator('form button[type=submit]');
    await submit.click();
    await observed;
    await expect.poll(() => submit.evaluate((node: HTMLButtonElement) => node.disabled)).toBe(true);
    await expect(submit).toHaveAttribute('aria-busy', 'true');
  } finally {
    release();
  }
  await expect(page).toHaveURL(/q=Teknoloji/);
});

test('arama adresi boş alan taşımaz: ilanlar, deneyimler, şirketler ve filtre alt sayfası', async ({
  page,
}) => {
  await loginAs(page, 'student');
  await page.setViewportSize({ width: 390, height: 844 });
  const query = () => Object.fromEntries(new URL(page.url()).searchParams);
  for (const path of ['/ilanlar', '/deneyimler', '/sirketler']) {
    await page.goto(path);
    await waitForHydratedForm(page, 'Ara');
    await page.getByRole('searchbox').fill('ornek');
    await page.getByRole('button', { name: 'Ara', exact: true }).click();
    await page.waitForURL(/q=ornek/);
    // `/ilanlar` aynı formda 5 süzgeç alanı taşır (`departmentId=&organization=&…`): boşlar adrese girmez.
    expect(query(), path).toEqual({ q: 'ornek' });
  }

  await page.goto('/ilanlar');
  await waitForHydratedForm(page, 'Ara');
  await page.getByRole('button', { name: /^Filtreler/ }).click();
  const sheet = page.locator('dialog[open]');
  const kind = sheet.locator('select[name="kind"]');
  const [firstKind] = await kind
    .locator('option')
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
  await kind.selectOption(firstKind!);
  await sheet.getByRole('button', { name: 'Filtreleri uygula' }).click();
  await page.waitForURL(/kind=/);
  expect(query()).toEqual({ kind: firstKind });

  // Süzgeç uygulanmışken arama da yalnız dolu alanları taşır: önceki süzgeç ve yeni arama.
  await waitForHydratedForm(page, 'Ara');
  await page.getByRole('searchbox').fill('stajyer');
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  await page.waitForURL(/q=stajyer/);
  expect(query()).toEqual({ kind: firstKind, q: 'stajyer' });
});

test('320 pikselde arama girdisi okunur kalır, süzgeç düğmesi alt satıra iner; başlık düğmeleri hizalı sarar', async ({
  page,
}) => {
  await loginAs(page, 'student');
  const boxOf = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!;
  const horizontalOverflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/deneyimler');
  const search = await boxOf(page.getByRole('searchbox'));
  const filters = await boxOf(page.getByRole('button', { name: /^Filtreler/ }).first());
  // 87 px'e düşüyordu ve yerli temizle (×) düğmesi "ornek"i kesiyordu: en az 7,5 rem (120 px) kalır, düğme alt satıra iner.
  expect(search.width, 'arama girdisi (320 px)').toBeGreaterThanOrEqual(120);
  expect(filters.y, 'Filtreler alt satırda (320 px)').toBeGreaterThanOrEqual(
    search.y + search.height,
  );
  const mine = await boxOf(page.getByRole('link', { name: 'Deneyimlerim', exact: true }));
  const companies = await boxOf(page.getByRole('link', { name: 'Şirketlere bak', exact: true }));
  // Alt alta sarınca ikinci düğme 8 px içeriden başlıyordu (`ml-2`): aynı soldan hizalı.
  expect(companies.y, 'başlık düğmeleri sarar (320 px)').toBeGreaterThan(mine.y);
  expect(companies.x, 'başlık düğmeleri soldan hizalı (320 px)').toBeCloseTo(mine.x, 0);
  expect(await horizontalOverflow()).toBe(0);

  // 360 px'te satır TEK kalır (alt sınır 160 px olsaydı ilk ekrandaki sonuçlar aşağı kayardı) ve başlık düğmeleri yan yana durur.
  await page.setViewportSize({ width: 360, height: 740 });
  const wide = await boxOf(page.getByRole('searchbox'));
  const wideFilters = await boxOf(page.getByRole('button', { name: /^Filtreler/ }).first());
  expect(wideFilters.y, 'Filtreler aynı satırda (360 px)').toBeLessThan(wide.y + wide.height);
  expect(
    Math.abs(
      (await boxOf(page.getByRole('link', { name: 'Şirketlere bak', exact: true }))).y -
        (await boxOf(page.getByRole('link', { name: 'Deneyimlerim', exact: true }))).y,
    ),
  ).toBeLessThan(2);
  expect(await horizontalOverflow()).toBe(0);
});

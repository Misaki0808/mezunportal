import { expect, test } from './fixture';
import { loginAs } from './login';

// Bütün liste adreslerinde aynı kural: geçersiz parametre sessizce varsayılana düşer (hata ekranı yok),
// aralık dışı sayfa son geçerli sayfaya çekilir (404 yok; adres düzelir).
const LISTS = [
  '/ilanlar',
  '/mentorlar',
  '/mezunlar',
  '/deneyimler',
  '/sirketler',
  '/sss',
  '/mulakat-sorulari',
] as const;

test('liste adreslerinde geçersiz parametre varsayılana düşer, aralık dışı sayfa son sayfaya çekilir', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loginAs(page, 'student');
  const titleOf = async (url: string) => {
    const response = await page.goto(url);
    expect(response?.status(), url).toBe(200);
    return page.locator('main h1').first().innerText();
  };
  for (const path of LISTS) {
    // Listenin kendi başlığı: geçersiz ya da aralık dışı adres hata ekranına değil, aynı listeye düşmeli.
    const title = await titleOf(path);
    for (const invalid of ['page=abc', 'page=0', 'page=-3', 'page=1.5', 'zzz=1', 'q=a']) {
      const url = `${path}?${invalid}`;
      expect(await titleOf(url), url).toBe(title);
    }
    // Seed her listede tek sayfadır: aralık dışı sayfa, sayfa parametresiz son sayfaya (1) yönlendirilir.
    for (const outOfRange of ['9', '999', '99999']) {
      const url = `${path}?page=${outOfRange}`;
      expect(await titleOf(url), url).toBe(title);
      await expect(page).toHaveURL((u) => u.pathname === path && !u.searchParams.has('page'));
    }
  }
});

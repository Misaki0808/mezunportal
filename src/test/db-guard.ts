/**
 * Veritabanlı testlerin sıfırlayacağı adresi seçer. Tek güvenlik kuralı: yalnız `DATABASE_URL_TEST`
 * okunur ve veritabanı adı `_test` ile bitmelidir; aksi halde fırlatır (geliştirme veritabanı asla
 * düşürülmez). Hata mesajı adresi (kimlik bilgisi içerebilir) taşımaz.
 */
export function resolveTestDatabaseUrl(env: Readonly<Record<string, string | undefined>>): string {
  const url = env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST tanımlı değil: veritabanlı testler için .env.local ya da ortamda test ' +
        'veritabanı adresi gerekir (docs/engineering.md "Yerel ortam"). Yalnız birim testleri için: pnpm test:unit',
    );
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    throw new Error('DATABASE_URL_TEST geçerli bir adres değil; sıfırlama reddedildi');
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error('DATABASE_URL_TEST adı "_test" ile bitmiyor; sıfırlama reddedildi');
  }
  return url;
}

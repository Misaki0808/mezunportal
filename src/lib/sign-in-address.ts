/**
 * Bağlantı istenen adres, "E-postanı kontrol et" ekranında gösterilmek üzere yalnız bu sekmenin oturum belleğinde
 * (`sessionStorage`) tutulur: URL'ye, çereze, sunucuya ve günlüğe girmez; sekme kapanınca gider. Bellek kapalıysa ya da
 * boşsa ekran adressiz de eksiksiz çalışır. Ortak bilgisayarda aynı sekmeyi sonra kullanan kişi öncekinin adresini görmesin
 * diye giriş tamamlanınca (oturumlu bir ekran çizilince) ve oturum kapatılınca silinir.
 */
const KEY = 'mezun.signin.address';
const MAX_LENGTH = 254;

export function rememberSignInAddress(address: string): void {
  try {
    window.sessionStorage.setItem(KEY, address.slice(0, MAX_LENGTH));
  } catch {
    /* Özel pencere ya da kapalı depolama: adres gösterilmez, akış bozulmaz. */
  }
}

export function readSignInAddress(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    return value ? value.slice(0, MAX_LENGTH) : null;
  } catch {
    return null;
  }
}

export function forgetSignInAddress(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* Bellek kapalıysa silinecek bir şey de yoktur. */
  }
}

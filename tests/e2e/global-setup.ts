import type { FullConfig } from '@playwright/test';

/**
 * E2E tek işçiyle koşar. Testler ortak seed hesaplarını (öğrenci, mezun mentor, yönetici…) paylaşır ve onların rıza, oturum,
 * puan, hikâye/deneyim ve oran sınırı gibi durumunu değiştirir; iki dosya aynı anda koşunca (`--workers=2`) 35'ten fazla spec
 * birbirinin verisini bozar ve kırmızılar kodla ilgisiz, yarışa bağlı olur. Hesabı yalnız birkaç spec için ayırmak yetmez:
 * yarış aynı hesapları kullanan bütün dosyalar arasındadır. Bu yüzden paralel koşu sessiz kırmızı yerine açık hata verir.
 */
export default function globalSetup(config: FullConfig) {
  if (config.workers > 1) {
    throw new Error(
      `E2E yalnız --workers=1 ile koşar (istenen: ${config.workers}): testler ortak seed hesaplarını paylaşır, paralel koşu yarış kırmızısı üretir (docs/engineering.md "Test").`,
    );
  }
}

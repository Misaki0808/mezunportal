/**
 * Sözleşme PR'ında imzası yazılmış ama gövdesi sonraki karta (servis) ait eylemler bunu fırlatır.
 * Kullanıcıya dönen hata değildir (500); gerçek gövde gelince kullanılmaz olur.
 */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`Henüz uygulanmadı: ${feature}`);
    this.name = 'NotImplementedError';
  }
}

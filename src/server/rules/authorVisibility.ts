/**
 * Yazar görünürlüğü (saf): adlı bir deneyimin yazar adı yalnız yazar GEÇERLİYSE gösterilir. Silinmiş hesap ve
 * askıdaki (süresiz ya da süresi dolmamış) kullanıcı gizlenir; içerik kalır, yazarsız (anonim biçimde) görünür.
 * Arama ve deneyim detayı aynı kuralı kullanır (K-09 ile birlikte: yazar bağı koparsa `author` zaten yoktur).
 */
export type AuthorAccountFacts = {
  deletedAt: Date | null;
  banned: boolean;
  banExpires: Date | null;
};

export function isAuthorVisible(author: AuthorAccountFacts | null | undefined, now: Date): boolean {
  if (!author) return false;
  if (author.deletedAt !== null) return false;
  if (
    author.banned &&
    (author.banExpires === null || author.banExpires.getTime() > now.getTime())
  ) {
    return false;
  }
  return true;
}

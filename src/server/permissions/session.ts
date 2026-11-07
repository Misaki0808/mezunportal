import 'server-only';

/**
 * Oturumdaki kullanıcının kimliği — yetki katmanının TEK oturum bağlantı noktası.
 *
 * Kimlik ve rol istemciden gelmez, oturumdan gelir. Better Auth P1-02'de kurulunca bu işlev onun
 * oturumunu (çerez → veritabanı oturumu → kullanıcı kimliği) okuyacak; başka hiçbir yer değişmez.
 * O zamana kadar KAPALIDIR (fail-closed): oturum yok sayılır ve bütün `require*` korumaları
 * `AUTH_UNAUTHENTICATED` ile reddeder.
 */
export async function getSessionUserId(): Promise<string | null> {
  return null;
}

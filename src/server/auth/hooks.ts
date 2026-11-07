/**
 * Better Auth veritabanı kancaları — SAF işlevler (KVKK veri en azlığı). Yapılandırma `config.ts`'te
 * bunları bağlar; davranışları `hooks.test.ts` sınar.
 */

/** Magic link ile ilk kez gelen kullanıcının adı boştur; e-postanın yerel kısmından türetilir (kullanıcı sonra düzeltir). */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const spaced = local
    .replace(/[._+-]+/g, ' ')
    .trim()
    .slice(0, 80);
  return spaced === '' ? 'Üye' : spaced;
}

type WithName = { name?: string | null; email: string } & Record<string, unknown>;

export function userCreateBefore<T extends WithName>(user: T): { data: T } {
  const email = user.email.trim().toLowerCase();
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  return { data: { ...user, email, name: name || nameFromEmail(email) } };
}

/** Oturum kaydında IP ve user-agent SAKLANMAZ (yetki kararına gerekmez; hız sınırı IP'yi kendi anahtarında özetler). */
export function sessionCreateBefore<T extends Record<string, unknown>>(session: T): { data: T } {
  return { data: { ...session, ipAddress: null, userAgent: null } };
}

/**
 * LinkedIn yalnız kimlik kanıtıdır (ad, e-posta, fotoğraf); girişten sonra sağlayıcı API'sine bir daha
 * gidilmez. Bu yüzden erişim/yenileme/kimlik jetonları ve süreleri SAKLANMAZ.
 */
export function accountTokensStripped<T extends Record<string, unknown>>(account: T): { data: T } {
  return {
    data: {
      ...account,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      password: null,
    },
  };
}

/** Günlüğe yalnız düzey ve temizlenmiş ileti yazılır: jeton, bağlantı ve e-posta ayıklanır; ek argümanlar atılır. */
export function sanitizeAuthLog(message: string): string {
  return message
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[e-posta]')
    .replace(/https?:\/\/\S+/g, '[bağlantı]')
    .replace(/\b(token|secret|code|state)=\S+/gi, '$1=[gizli]')
    .slice(0, 300);
}

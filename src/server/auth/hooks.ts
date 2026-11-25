/**
 * Better Auth veritabanı kancaları — SAF işlevler (KVKK veri en azlığı). Yapılandırma `config.ts`'te
 * bunları bağlar; davranışları `hooks.test.ts` sınar.
 */

import { turkishFirstNames } from './turkish-first-names';

const firstNames = new Set(turkishFirstNames);
const longestFirstNames = [...firstNames].sort((a, b) => b.length - a.length);

/** Magic link ile ilk kez gelen kullanıcının adı boştur; tahmin kullanıcı tarafından düzeltilebilir. */
export function nameFromEmail(email: string): string {
  const local = (email.split('@')[0] ?? '').normalize('NFC').replace(/[0-9]/g, '');
  let parts = local.split(/[._+\-]+/u).filter(Boolean);
  if (parts.length === 1) {
    const word = parts[0]!.toLocaleLowerCase('tr-TR');
    if (!firstNames.has(word)) {
      const firstName = longestFirstNames.find((name) => word.startsWith(name));
      const rest = firstName ? word.slice(firstName.length) : '';
      if (firstName && /^\p{L}{3,}$/u.test(rest) && !firstNames.has(rest)) {
        parts = [firstName, rest];
      }
    }
  }
  const name = parts
    .map((part) => {
      const lower = part.toLocaleLowerCase('tr-TR');
      return (lower[0]?.toLocaleUpperCase('tr-TR') ?? '') + lower.slice(1);
    })
    .join(' ')
    .slice(0, 80);
  return name || 'Üye';
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

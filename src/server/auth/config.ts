import 'server-only';

import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';
import { createAccessControl } from 'better-auth/plugins/access';
import { magicLink } from 'better-auth/plugins/magic-link';

import { EMAIL_CHANGE_RETURN_PATHS } from '@/contracts/auth';
import type { PrismaClient } from '@/generated/prisma/client';
import { isLinkedInConfigured, type AuthEnv } from '@/lib/env';
import { isDevToolsEnabled } from '@/lib/app-env';

import {
  accountTokensStripped,
  sanitizeAuthLog,
  sessionCreateBefore,
  userCreateBefore,
} from './hooks';
import { emitEvent } from '../services/event';
import { guardDeletedUsers, isUserDeleted } from './deleted-user-guard';
import { SIGN_IN_LINK_MINUTES, type AuthEmailPort } from './email-port';
import { testLoginPlugin } from './test-login-plugin';

/**
 * Better Auth doğrulama bağlantısının `callbackURL` sorgusunu SABİT site içi yolla değiştirir (yalnız
 * bizim ürettiğimiz bağlantıda; istemciden yol alınmaz).
 */
export function withCallbackPath(url: string, path: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('callbackURL', path);
  return parsed.toString();
}

/**
 * Oturum çerezinden oturum jetonunu okur. İmzayı DOĞRULAMAZ: yalnız hangi oturumun kalacağını seçer; jeton tablodaki
 * hiçbir oturumla eşleşmezse (sahte/eski çerez) hiçbir oturum korunmaz, yani yanlış çerez fazladan oturum bırakamaz.
 */
export function sessionTokenFromCookie(
  cookieHeader: string | null,
  cookieName: string,
): string | null {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== cookieName) continue;
    try {
      return decodeURIComponent(rest.join('=')).split('.')[0] || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * E-posta değişiminin 2. adım bağlantısından değişen kullanıcıyı okur (`requestType: change-email-verification`). İmzayı
 * DOĞRULAMAZ: yalnız Better Auth jetonu doğrulayıp kullanıcıyı güncellemeye hazırlandığı anda (`user.update.before`)
 * çağrılır; yük ayrıca güncellenecek yeni adresle eşleşmelidir. Başka istek, başka tür ya da eşleşmeyen adres `null` döner.
 */
export function emailChangeUserId(token: unknown, newEmail: unknown): string | null {
  if (typeof token !== 'string' || typeof newEmail !== 'string') return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    const { requestType, updateTo, userId } = payload as Record<string, unknown>;
    if (requestType !== 'change-email-verification') return null;
    if (typeof userId !== 'string' || typeof updateTo !== 'string') return null;
    return updateTo === newEmail.toLowerCase() ? userId : null;
  } catch {
    return null;
  }
}

export const SESSION_EXPIRES_IN_SECONDS = 14 * 24 * 3600;
export const SESSION_UPDATE_AGE_SECONDS = 24 * 3600;

export type AuthDeps = {
  db: PrismaClient;
  env: AuthEnv;
  email: AuthEmailPort;
  /** Sunucu eylemlerinde çerez yazımı için (Next.js `cookies()`); birim testlerinde kapalı. */
  nextCookies?: boolean;
};

/**
 * Admin eklentisi YALNIZ ban semantiği için vardır (oturum açılışında `banned` kontrolü, `BANNED_USER`).
 * Yetki modelimiz `Membership`/`AdminGrant`'tır; eklentinin rol sistemi KAPATILIR:
 *  - hiçbir rol yönetici sayılmaz (`adminRoles: []`), `adminUserIds` verilmez;
 *  - tanımlı tek rol `user` ve hiçbir izni yoktur → `User.role = 'admin'` olsa bile `impersonate-user`,
 *    `set-role`, `remove-user` … çağrıları reddedilir (davranış testi: `config.db.test.ts`);
 *  - ek olarak admin HTTP uçları beyaz listede yoktur (`rules/authRoutePolicy.ts`).
 */
const accessControl = createAccessControl({
  user: [
    'create',
    'list',
    'set-role',
    'ban',
    'impersonate',
    'delete',
    'set-password',
    'get',
    'update',
  ],
} as const);
const noPowerRoles = { user: accessControl.newRole({ user: [] }) };

/** Sağlayıcıya özel ayarlar dışında, ortam bağımsız çekirdek yapılandırma (saf: `betterAuth()` çağırmaz). */
export function buildAuthOptions(deps: AuthDeps) {
  const { env, db, email } = deps;
  const production = env.APP_ENV === 'prod';

  return {
    appName: 'MezunPortal',
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    // Silme yarışı (kart 371): oturum/hesap oluşturma kullanıcıyı kilitleyip silinmişi reddeder, kullanıcı güncelleme
    // silinmişe yazmaz. `emitEvent` gibi kendi sorgularımız ham `db`'yi kullanır.
    database: prismaAdapter(guardDeletedUsers(db), { provider: 'postgresql' }),
    telemetry: { enabled: false },

    // Parolasız giriş: e-posta/parola kapalı.
    emailAndPassword: { enabled: false },

    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      // Çerez önbelleği KAPALI: askıya alma/silme anında etkili olmalı (bayat oturum yok).
      cookieCache: { enabled: false },
    },

    account: {
      // Aynı doğrulanmış e-postaya sahip LinkedIn hesabı mevcut kullanıcıya bağlanır; sağlayıcı e-postayı
      // doğrulanmış bildirmezse bağlanmaz (güvenilir-sağlayıcı listesi BOŞ: hesap devralmayı önler).
      accountLinking: { enabled: true, trustedProviders: [], allowDifferentEmails: false },
    },

    user: {
      changeEmail: {
        enabled: true,
        // 1. adım: ESKİ adrese onay bağlantısı; 2. adım (onaydan sonra) YENİ adrese doğrulama bağlantısı.
        sendChangeEmailConfirmation: async ({ user, newEmail, url, token }) => {
          await email.sendChangeEmailConfirmation({
            to: user.email,
            newEmail,
            url,
            token,
            userId: user.id,
          });
        },
      },
    },
    emailVerification: {
      expiresIn: 3600,
      autoSignInAfterVerification: false,
      sendOnSignUp: false,
      sendOnSignIn: false,
      // Diğer oturumların kapanması `databaseHooks.user.update.before` içindedir (e-posta güncellemesinden ÖNCE); burada
      // `afterEmailVerification` YOKTUR: sonradan silme hata verirse e-posta değişmiş ama öteki oturum açık kalırdı (kart 538 P1).
      // Yalnız e-posta değiştirmenin 2. adımında kullanılır: `user.email` YENİ adrestir.
      sendVerificationEmail: async ({ user, url, token }) => {
        // Silme sürerken tıklanan eski adres onayı yeni adrese e-posta göndermez (kart 371).
        if (await isUserDeleted(db, user.id)) return;
        // 2. adımın bağlantısı ayrı ekrana döner (`?adim=tamamlandi`); 1. adımınki `eski-onaylandi`.
        await email.sendChangeEmailVerification({
          to: user.email,
          url: withCallbackPath(url, EMAIL_CHANGE_RETURN_PATHS.completed),
          token,
          userId: user.id,
        });
      },
    },

    socialProviders: isLinkedInConfigured(env)
      ? {
          linkedin: {
            clientId: env.LINKEDIN_CLIENT_ID ?? '',
            clientSecret: env.LINKEDIN_CLIENT_SECRET ?? '',
          },
        }
      : {},

    // Hız sınırı DB'de (süreçler/yeniden başlatma arasında korunur). Eylem düzeyi sınırlarımız ayrıdır
    // (`rate-limit.ts`); bu, HTTP'den açık kalan GET uçlarını korur.
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 1000,
      customRules: {
        '/magic-link/verify': { window: 300, max: 120 },
        '/verify-email': { window: 300, max: 120 },
        '/callback/linkedin': { window: 300, max: 10 },
      },
    },

    advanced: {
      // Çerez: httpOnly + sameSite=lax her zaman; secure canlıda (yerel http'de çalışmak zorunda).
      useSecureCookies: production,
      cookiePrefix: 'mezun',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
      database: { generateId: 'uuid' },
    },

    databaseHooks: {
      user: {
        create: { before: async (user) => userCreateBefore(user) },
        update: {
          // E-posta değişimi tamamlanırken (yalnız 2. adım, doğrulama bağlantısına tıklanınca) bu isteği yapan oturum kalır,
          // kullanıcının DİĞER oturumları kapanır (kart 531 B5: çalınmış çerez e-posta değişimiyle düşmüyordu). Silme
          // e-posta güncellemesinden ÖNCE çalışır: silme hata verirse hata yayılır, güncelleme hiç yapılmaz (e-posta aynı kalır,
          // bağlantı yeniden kullanılabilir); silme sonrası güncelleme düşerse yalnız oturumlar kapanmış olur. "E-posta değişti
          // ama öteki oturum açık" durumu hiçbir yolda oluşmaz (kart 538 P1). Better Auth'un `revokeOtherSessions` çağrısı bu
          // kancada kullanılamaz (oturum çözümü/örnek yok); aynı anlam doğrudan oturum tablosunda uygulanır. Bağlantı oturumsuz
          // bir tarayıcıda açılırsa korunacak oturum yoktur: hepsi kapanır.
          before: async (data, context) => {
            const request = context as
              { path?: string; query?: { token?: unknown }; request?: Request } | null | undefined;
            if (request?.path !== '/verify-email') return;
            const userId = emailChangeUserId(request.query?.token, data.email);
            if (!userId) return;
            const keep = sessionTokenFromCookie(
              request.request?.headers.get('cookie') ?? null,
              `${production ? '__Secure-' : ''}mezun.session_token`,
            );
            await db.session.deleteMany({
              where: { userId, ...(keep ? { token: { not: keep } } : {}) },
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => sessionCreateBefore(session),
          // Kullanım olayı (P1-13): oturum açıldıktan sonra, ateşle-ve-unut (giriş yanıtını yavaşlatmaz ya da bozmaz).
          after: async (session, context) => {
            const path = (context as { path?: string } | null | undefined)?.path ?? '';
            emitEvent(db, session.userId, {
              type: 'LOGIN',
              props: { method: path.includes('linkedin') ? 'LINKEDIN' : 'EMAIL_LINK' },
            });
          },
        },
      },
      account: {
        create: { before: async (account) => accountTokensStripped(account) },
        update: { before: async (account) => accountTokensStripped(account) },
      },
    },

    // Günlüğe yalnız düzey + temizlenmiş ileti: jeton, bağlantı, e-posta ve ek argümanlar yazılmaz.
    logger: {
      level: 'error',
      log: (level, message) => {
        process.stderr.write(`[auth:${level}] ${sanitizeAuthLog(message)}\n`);
      },
    },

    plugins: [
      admin({ adminRoles: [], ac: accessControl, roles: noPowerRoles, defaultRole: 'user' }),
      magicLink({
        expiresIn: SIGN_IN_LINK_MINUTES * 60,
        storeToken: 'hashed',
        // Kayıtsız e-posta da bağlantı alır (yeni üye ilk girişte oluşur); kayıt durumu sızmaz.
        disableSignUp: false,
        rateLimit: { window: 300, max: 120 },
        sendMagicLink: async ({ email: to, url, token }) => {
          await email.sendSignInLink({ to, url, token });
        },
      }),
      // TEST GİRİŞİ: prod'da yapılandırmaya HİÇ eklenmez.
      ...(isDevToolsEnabled({ APP_ENV: env.APP_ENV }) ? [testLoginPlugin()] : []),
      // Çerez köprüsü HER ZAMAN son eklenti olmalı.
      ...(deps.nextCookies ? [nextCookies()] : []),
    ],
  } satisfies BetterAuthOptions;
}

export function createAuth(deps: AuthDeps) {
  return betterAuth(buildAuthOptions(deps));
}

export type MezunAuth = ReturnType<typeof createAuth>;

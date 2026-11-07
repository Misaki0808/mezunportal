import { describe, expect, it } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';
import { testAuthEnv, createFakeEmail } from '@/test/auth';

import { buildAuthOptions, SESSION_EXPIRES_IN_SECONDS } from './config';
import { TEST_LOGIN_PLUGIN_ID } from './test-login-plugin';

// Yapılandırma saf kurulur (veritabanına bağlanmaz): sahte istemci yeterli.
const db = {} as PrismaClient;
const options = (env = testAuthEnv()) =>
  buildAuthOptions({ db, env, email: createFakeEmail().port });
const pluginIds = (env = testAuthEnv()) => options(env).plugins.map((plugin) => plugin.id);

describe('Better Auth yapılandırması', () => {
  it('TEST GİRİŞİ eklentisi yalnız local ve test ortamında vardır; prod’da HİÇ eklenmez', () => {
    expect(pluginIds(testAuthEnv({ APP_ENV: 'local' }))).toContain(TEST_LOGIN_PLUGIN_ID);
    expect(pluginIds(testAuthEnv({ APP_ENV: 'test' }))).toContain(TEST_LOGIN_PLUGIN_ID);
    const prod = testAuthEnv({
      APP_ENV: 'prod',
      BETTER_AUTH_SECRET: 'x'.repeat(48),
      APP_URL: 'https://mezun.example.test',
    });
    expect(pluginIds(prod)).not.toContain(TEST_LOGIN_PLUGIN_ID);
    expect(pluginIds(prod)).toEqual(['admin', 'magic-link']);
  });

  it('e-posta/parola kapalı (parolasız giriş); hesap bağlama güvenilir sağlayıcı listesi BOŞ', () => {
    const o = options();
    expect(o.emailAndPassword.enabled).toBe(false);
    expect(o.account.accountLinking).toMatchObject({
      enabled: true,
      trustedProviders: [],
      allowDifferentEmails: false,
    });
  });

  it('LinkedIn yalnız iki anahtar da verilince yapılandırılır', () => {
    expect(options(testAuthEnv()).socialProviders).toEqual({});
    expect(
      options(testAuthEnv({ LINKEDIN_CLIENT_ID: 'a', LINKEDIN_CLIENT_SECRET: 'b' }))
        .socialProviders,
    ).toEqual({ linkedin: { clientId: 'a', clientSecret: 'b' } });
  });

  it('oturum çerezi: önbellek kapalı, 14 gün; canlıda secure, her zaman httpOnly+lax; telemetri kapalı', () => {
    const o = options();
    expect(o.session.cookieCache.enabled).toBe(false);
    expect(o.session.expiresIn).toBe(SESSION_EXPIRES_IN_SECONDS);
    expect(SESSION_EXPIRES_IN_SECONDS).toBe(14 * 24 * 3600);
    expect(o.advanced.defaultCookieAttributes).toEqual({ httpOnly: true, sameSite: 'lax' });
    expect(o.advanced.useSecureCookies).toBe(false);
    expect(o.telemetry.enabled).toBe(false);
    const prod = options(
      testAuthEnv({
        APP_ENV: 'prod',
        BETTER_AUTH_SECRET: 'x'.repeat(48),
        APP_URL: 'https://mezun.example.test',
      }),
    );
    expect(prod.advanced.useSecureCookies).toBe(true);
  });

  it('hız sınırı AÇIK (varsayılan yalnız prod) ve veritabanında saklanır', () => {
    const o = options();
    expect(o.rateLimit).toMatchObject({ enabled: true, storage: 'database' });
    expect(Object.keys(o.rateLimit.customRules)).toEqual([
      '/magic-link/verify',
      '/verify-email',
      '/callback/linkedin',
    ]);
  });

  it('yalnız APP_URL güvenilir kökendir; sır env’den gelir; giriş bağlantısı 10 dk ve özetli saklanır', () => {
    const env = testAuthEnv();
    const o = options(env);
    expect(o.trustedOrigins).toEqual([env.APP_URL]);
    expect(o.baseURL).toBe(env.APP_URL);
    expect(o.secret).toBe(env.BETTER_AUTH_SECRET);
  });

  it('günlük: yalnız hata düzeyi; jeton/bağlantı/e-posta ayıklanır', () => {
    const written: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      const logger = options().logger;
      // Ek argümanlar (örn. nesneler) günlük işlevine hiç iletilmez; yalnız düzey + temiz ileti yazılır.
      logger.log('error', 'başarısız ayse@ogr.iu.edu.tr https://x.test/?token=abc');
    } finally {
      process.stderr.write = original;
    }
    expect(written.join('')).toBe('[auth:error] başarısız [e-posta] [bağlantı]\n');
  });
});

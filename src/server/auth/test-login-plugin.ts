import 'server-only';

import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

import { TEST_LOGIN_PERSONAS } from '@/contracts/auth';

import { TEST_PERSONA_EMAILS, TEST_EMAIL_DOMAIN } from './test-personas';

export const TEST_LOGIN_PLUGIN_ID = 'test-login';

/**
 * TEST GİRİŞİ: seed kullanıcısı olarak e-posta bağlantısı olmadan oturum açar (telefon testi, Playwright).
 * Bu eklenti YALNIZ `APP_ENV` `local`/`test` iken yapılandırmaya eklenir (`config.ts`); `prod`'da eklenti
 * ve uç hiç yoktur. HTTP uçları beyaz listede değildir (`rules/authRoutePolicy.ts`): yalnız sunucu eylemi
 * `auth.api.testLogin` ile çağırır. Yalnız `@test.mezunportal.local` kullanıcılarına oturum açar.
 */
export const testLoginPlugin = () =>
  ({
    id: TEST_LOGIN_PLUGIN_ID,
    endpoints: {
      testLogin: createAuthEndpoint(
        '/test-login',
        { method: 'POST', body: z.object({ persona: z.enum(TEST_LOGIN_PERSONAS) }) },
        async (ctx) => {
          const email = TEST_PERSONA_EMAILS[ctx.body.persona];
          if (!email.endsWith(`@${TEST_EMAIL_DOMAIN}`)) {
            throw APIError.from('FORBIDDEN', {
              message: 'Test girişi yalnız test kullanıcıları içindir',
              code: 'TEST_LOGIN_FORBIDDEN',
            });
          }
          const found = await ctx.context.internalAdapter.findUserByEmail(email);
          if (!found?.user) {
            throw APIError.from('NOT_FOUND', {
              message: 'Test kullanıcısı yok (pnpm db:seed)',
              code: 'TEST_PERSONA_NOT_FOUND',
            });
          }
          const session = await ctx.context.internalAdapter.createSession(found.user.id);
          await setSessionCookie(ctx, { session, user: found.user });
          return ctx.json({ signedIn: true as const });
        },
      ),
    },
  }) as const;

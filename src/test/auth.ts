import { parseAuthEnv, type AuthEnv } from '@/lib/env';
import type { PrismaClient } from '@/generated/prisma/client';
import { createAuth } from '@/server/auth/config';
import type { AuthEmailPort } from '@/server/auth/email-port';

/** Gönderilen e-postaları kaydeden sahte e-posta bağlantı noktası (gerçek kuyruk R2'de). */
export type SentEmails = {
  signInLinks: { to: string; url: string; token: string }[];
  changeConfirmations: {
    to: string;
    newEmail: string;
    url: string;
    token: string;
    userId: string;
  }[];
  changeVerifications: { to: string; url: string; token: string; userId: string }[];
  decisions: {
    to: string;
    userId: string;
    documentId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason?: string;
  }[];
};

export function createFakeEmail(): {
  port: AuthEmailPort;
  sent: SentEmails;
  fail: { all: boolean };
} {
  const sent: SentEmails = {
    signInLinks: [],
    changeConfirmations: [],
    changeVerifications: [],
    decisions: [],
  };
  const fail = { all: false };
  const guard = () => {
    if (fail.all) throw new Error('kuyruk kapalı');
  };
  return {
    sent,
    fail,
    port: {
      async sendSignInLink(input) {
        guard();
        sent.signInLinks.push(input);
      },
      async sendChangeEmailConfirmation(input) {
        guard();
        sent.changeConfirmations.push(input);
      },
      async sendChangeEmailVerification(input) {
        guard();
        sent.changeVerifications.push(input);
      },
      async sendGraduationDocumentDecision(input) {
        guard();
        sent.decisions.push(input);
      },
    },
  };
}

export const TEST_AUTH_ENV = {
  APP_ENV: 'test',
  APP_URL: 'http://localhost:3162',
  BETTER_AUTH_SECRET: 'dev-only-insecure-secret-for-local-and-test-0000',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  EMAIL_FROM: 'MezunPortal <no-reply@test.mezunportal.local>',
} as const;

export function testAuthEnv(overrides: Record<string, string | undefined> = {}): AuthEnv {
  return parseAuthEnv({ ...TEST_AUTH_ENV, ...overrides });
}

/** Gerçek Better Auth örneği + gerçek (test) veritabanı + sahte e-posta. */
export function createTestAuth(prisma: PrismaClient, env: AuthEnv = testAuthEnv()) {
  const email = createFakeEmail();
  const auth = createAuth({ db: prisma, env, email: email.port });
  return { auth, env, ...email };
}

let addressCounter = 0;
/** Gerçek alan adı kullanmayan benzersiz adres (ör. `kisi-1-abc@ogr.test.local`). */
export function uniqueAddress(domain: string, prefix = 'kisi'): string {
  addressCounter += 1;
  return `${prefix}-${addressCounter}-${Math.random().toString(36).slice(2, 8)}@${domain}`;
}

/** Yanıttaki `Set-Cookie` başlıklarından istek `Cookie` başlığı kurar. */
export function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0] ?? '')
    .filter(Boolean)
    .join('; ');
}

/** E-posta bağlantısıyla giriş: bağlantıyı iste, tıkla, oturum çerezini döner. */
export async function signInWithMagicLink(
  auth: ReturnType<typeof createTestAuth>['auth'],
  sent: SentEmails,
  address: string,
): Promise<{ cookie: string; headers: Headers }> {
  const before = sent.signInLinks.length;
  await auth.api.signInMagicLink({
    body: { email: address, callbackURL: '/', errorCallbackURL: '/giris' },
    headers: new Headers(),
  });
  const link = sent.signInLinks[before];
  if (!link) throw new Error('Giriş bağlantısı gönderilmedi');
  const response = await auth.api.magicLinkVerify({
    query: { token: new URL(link.url).searchParams.get('token') ?? '', callbackURL: '/' },
    headers: new Headers(),
    asResponse: true,
  });
  const cookie = cookieHeaderFrom(response);
  if (!cookie) throw new Error(`Oturum çerezi alınamadı (durum ${response.status})`);
  return { cookie, headers: new Headers({ cookie }) };
}

import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { createTestAuth, signInWithMagicLink, uniqueAddress } from '@/test/auth';

import { DELETED_USER_NAME, deleteAccount, deletedEmailFor } from '../services/accountDeletion';
import { guardDeletedUsers } from './deleted-user-guard';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

type Harness = ReturnType<typeof createTestAuth>;

async function signedUpUser() {
  const harness = createTestAuth(prisma);
  const address = uniqueAddress('ornek.test', 'silinecek');
  const { headers } = await signInWithMagicLink(harness.auth, harness.sent, address);
  const userId = (await harness.auth.api.getSession({ headers }))?.user.id ?? '';
  return { harness, address, userId, headers };
}

const del = (
  userId: string,
  email: string,
  handlers: Parameters<typeof deleteAccount>[3]['handlers'] = [],
) =>
  deleteAccount(
    prisma,
    userId,
    { publishedContent: 'DELETE', confirmEmail: email },
    { handlers, removeStoredFiles: null },
  );

async function issueMagicLink(harness: Harness, address: string) {
  const before = harness.sent.signInLinks.length;
  await harness.auth.api.signInMagicLink({
    body: { email: address, callbackURL: '/', errorCallbackURL: '/giris' },
    headers: new Headers(),
  });
  const link = harness.sent.signInLinks[before];
  if (!link) throw new Error('bağlantı yok');
  return new URL(link.url).searchParams.get('token') ?? '';
}
const clickMagicLink = (harness: Harness, token: string) =>
  harness.auth.api
    .magicLinkVerify({
      query: { token, callbackURL: '/', errorCallbackURL: '/giris' },
      headers: new Headers(),
      asResponse: true,
    })
    .then(
      (response) => ({
        status: response.status,
        location: response.headers.get('location') ?? '',
        // Oturum çerezi (jeton) verildi mi?
        cookie: response.headers.getSetCookie().some((value) => /session_token=[^;]+/.test(value)),
      }),
      () => ({ status: 0, location: '', cookie: false }),
    );

async function lockWaiters() {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()
      AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'`;
  return rows[0]?.n ?? 0;
}
async function waitUntil(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

/** Silme işlemini açık tutar; `during` çalışırken kilit beklemesi ölçülür, sonra silme tamamlanır. */
async function whileDeletionOpen(
  userId: string,
  email: string,
  during: () => Promise<unknown>,
): Promise<{ waited: boolean }> {
  let release!: () => void;
  let locked!: () => void;
  const open = new Promise<void>((resolve) => (locked = resolve));
  const proceed = new Promise<void>((resolve) => (release = resolve));
  const deletion = del(userId, email, [
    async () => {
      locked();
      await proceed;
    },
  ]);
  try {
    await open;
    const operation = during();
    const waited = await waitUntil(async () => (await lockWaiters()) > 0);
    release();
    await deletion;
    await operation;
    return { waited };
  } finally {
    release();
  }
}

const state = async (userId: string) => ({
  user: await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true, emailVerified: true, deletedAt: true },
  }),
  sessions: await prisma.session.count({ where: { userId } }),
  accounts: await prisma.account.count({ where: { userId } }),
});

describe('hesap silme ile Better Auth yazımları (kart 371)', () => {
  it('KONTROL: silme tek başına oturumları ve bağlantıları siler, e-postayı anonimleştirir', async () => {
    const { address, userId } = await signedUpUser();
    await del(userId, address);
    const after = await state(userId);
    expect(after.user).toMatchObject({
      name: DELETED_USER_NAME,
      email: deletedEmailFor(userId),
      emailVerified: false,
    });
    expect(after.sessions).toBe(0);
    expect(after.accounts).toBe(0);
  });

  it('M1: silmeden ÖNCE alınmış giriş bağlantısı iptal edilir; silmeden sonra tıklanırsa oturum da yeni hesap da oluşmaz', async () => {
    const { harness, address, userId } = await signedUpUser();
    const token = await issueMagicLink(harness, address);
    await del(userId, address);
    const click = await clickMagicLink(harness, token);
    const after = await state(userId);
    expect(after.sessions).toBe(0);
    expect(after.user.name).toBe(DELETED_USER_NAME);
    expect(after.user.email).toBe(deletedEmailFor(userId));
    // Silme bekleyen giriş bağlantılarını iptal eder: bağlantı geçersizdir, ne oturum çerezi ne yeni hesap oluşur.
    expect(click.cookie).toBe(false);
    expect(await prisma.user.count({ where: { email: address } })).toBe(0);
  });

  it('M2: silme sürerken tıklanan giriş bağlantısı silinmiş kullanıcıya oturum bırakmaz', async () => {
    const { harness, address, userId } = await signedUpUser();
    const token = await issueMagicLink(harness, address);
    const { waited } = await whileDeletionOpen(userId, address, () =>
      clickMagicLink(harness, token),
    );
    const after = await state(userId);
    expect(after.sessions).toBe(0);
    expect(after.user.name).toBe(DELETED_USER_NAME);
    expect(after.user.emailVerified).toBe(false);
  });

  it('M3: eski adrese gelen e-posta değişikliği onayı silmeden sonra tıklanırsa e-posta geri yazılmaz', async () => {
    const { harness, address, userId, headers } = await signedUpUser();
    const newAddress = uniqueAddress('ornek.test', 'yeni');
    await harness.auth.api.changeEmail({
      body: { newEmail: newAddress, callbackURL: '/' },
      headers,
    });
    const token =
      new URL(harness.sent.changeConfirmations[0]?.url ?? '').searchParams.get('token') ?? '';
    await del(userId, address);
    await harness.auth.api
      .verifyEmail({ query: { token, callbackURL: '/' }, headers: new Headers(), asResponse: true })
      .catch(() => null);
    const after = await state(userId);
    expect(after.user.email).toBe(deletedEmailFor(userId));
    expect(harness.sent.changeVerifications).toHaveLength(0);
  });

  it('M4: YENİ adrese gitmiş doğrulama bağlantısı silmeden sonra tıklanırsa e-posta geri yazılmaz', async () => {
    const { harness, address, userId, headers } = await signedUpUser();
    const newAddress = uniqueAddress('ornek.test', 'yeni');
    await harness.auth.api.changeEmail({
      body: { newEmail: newAddress, callbackURL: '/' },
      headers,
    });
    const confirm =
      new URL(harness.sent.changeConfirmations[0]?.url ?? '').searchParams.get('token') ?? '';
    await harness.auth.api.verifyEmail({
      query: { token: confirm, callbackURL: '/' },
      headers,
      asResponse: true,
    });
    const verify =
      new URL(harness.sent.changeVerifications[0]?.url ?? '').searchParams.get('token') ?? '';
    await del(userId, address);
    await harness.auth.api
      .verifyEmail({
        query: { token: verify, callbackURL: '/' },
        headers: new Headers(),
        asResponse: true,
      })
      .catch(() => null);
    const after = await state(userId);
    expect(after.user.email).toBe(deletedEmailFor(userId));
    expect(after.user.emailVerified).toBe(false);
  });

  it('M5: silme sürerken yeni adres doğrulaması tıklanırsa e-posta geri yazılmaz', async () => {
    const { harness, address, userId, headers } = await signedUpUser();
    const newAddress = uniqueAddress('ornek.test', 'yeni');
    await harness.auth.api.changeEmail({
      body: { newEmail: newAddress, callbackURL: '/' },
      headers,
    });
    const confirm =
      new URL(harness.sent.changeConfirmations[0]?.url ?? '').searchParams.get('token') ?? '';
    await harness.auth.api.verifyEmail({
      query: { token: confirm, callbackURL: '/' },
      headers,
      asResponse: true,
    });
    const verify =
      new URL(harness.sent.changeVerifications[0]?.url ?? '').searchParams.get('token') ?? '';
    const { waited } = await whileDeletionOpen(userId, address, () =>
      harness.auth.api
        .verifyEmail({
          query: { token: verify, callbackURL: '/' },
          headers: new Headers(),
          asResponse: true,
        })
        .catch(() => null),
    );
    const after = await state(userId);
    // Gerçek kilit: doğrulama silme sürerken kullanıcı satırını güncellemeye çalıştı ve bekledi.
    expect(waited).toBe(true);
    expect(after.user.email).toBe(deletedEmailFor(userId));
    expect(after.user.emailVerified).toBe(false);
    expect(after.user.name).toBe(DELETED_USER_NAME);
  });

  it('M6: silinmiş kullanıcıya hesap bağlama (LinkedIn) ve oturum oluşturma adaptör düzeyinde reddedilir', async () => {
    const { harness, address, userId } = await signedUpUser();
    await del(userId, address);
    const context = await harness.auth.$context;
    await context.internalAdapter
      .linkAccount({ userId, providerId: 'linkedin', accountId: `li-${randomUUID()}` })
      .catch(() => null);
    await context.internalAdapter.createSession(userId).catch(() => null);
    const after = await state(userId);
    expect(after.accounts).toBe(0);
    expect(after.sessions).toBe(0);
  });

  it('M7: silmeden sonra bekleyen doğrulama kayıtlarında silinen kişinin e-postası kalmaz', async () => {
    const { harness, address, userId, headers } = await signedUpUser();
    await issueMagicLink(harness, address);
    await harness.auth.api.changeEmail({
      body: { newEmail: uniqueAddress('ornek.test', 'yeni'), callbackURL: '/' },
      headers,
    });
    await del(userId, address);
    const rows = await prisma.verification.findMany({ select: { identifier: true, value: true } });
    const leftovers = rows.filter((row) => `${row.identifier} ${row.value}`.includes(address));
    expect(leftovers).toHaveLength(0);
  });

  it('M8: silme ve giriş bağlantısı aynı anda, tekrarlı denemeler: silinen kimliğe oturum ve bağlantı kalmaz', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const { harness, address, userId } = await signedUpUser();
      const token = await issueMagicLink(harness, address);
      await Promise.allSettled([
        attempt % 2 === 0 ? del(userId, address) : clickMagicLink(harness, token),
        attempt % 2 === 0 ? clickMagicLink(harness, token) : del(userId, address),
      ]);
      const after = await state(userId);
      expect(after.sessions).toBe(0);
      expect(after.accounts).toBe(0);
      expect(after.user.name).toBe(DELETED_USER_NAME);
      expect(after.user.email).toBe(deletedEmailFor(userId));
    }
  });

  it('M9: silme ve yeni adres doğrulaması aynı anda, tekrarlı denemeler: e-posta hiçbir sırada anonim hesaba geri yazılmaz', async () => {
    const outcomes = { deleted: 0, rejected: 0 };
    for (let attempt = 0; attempt < 10; attempt++) {
      const { harness, address, userId, headers } = await signedUpUser();
      const newAddress = uniqueAddress('ornek.test', 'yeni');
      await harness.auth.api.changeEmail({
        body: { newEmail: newAddress, callbackURL: '/' },
        headers,
      });
      const confirm =
        new URL(harness.sent.changeConfirmations[0]?.url ?? '').searchParams.get('token') ?? '';
      await harness.auth.api.verifyEmail({
        query: { token: confirm, callbackURL: '/' },
        headers,
        asResponse: true,
      });
      const verify =
        new URL(harness.sent.changeVerifications[0]?.url ?? '').searchParams.get('token') ?? '';
      const click = () =>
        harness.auth.api
          .verifyEmail({
            query: { token: verify, callbackURL: '/' },
            headers: new Headers(),
            asResponse: true,
          })
          .catch(() => null);
      const deletion = () =>
        del(userId, address).then(
          () => 'OK',
          (error: unknown) => (isCodedError(error) ? error.code : 'KODSUZ'),
        );
      const [first, second] =
        attempt % 2 === 0
          ? await Promise.all([deletion(), click()])
          : await Promise.all([click(), deletion()]);
      const result = attempt % 2 === 0 ? first : second;
      const after = await state(userId);
      if (result === 'OK') {
        // Silme tamamlandıysa hesap anonim kalır; yeni adres geri yazılamaz.
        outcomes.deleted += 1;
        expect(after.user.email).toBe(deletedEmailFor(userId));
        expect(after.user.emailVerified).toBe(false);
        expect(after.user.name).toBe(DELETED_USER_NAME);
        expect(after.user.deletedAt).not.toBeNull();
      } else {
        // E-posta silmeden ÖNCE değiştiyse onay adresi artık eşleşmez ve silme kararlı kodla reddedilir; hesap sağlamdır.
        outcomes.rejected += 1;
        expect(result).toBe('ACCOUNT_DELETE_CONFIRMATION_MISMATCH');
        expect(after.user).toMatchObject({ email: newAddress, deletedAt: null });
      }
    }
    expect(outcomes.deleted + outcomes.rejected).toBe(10);
  });

  it('M10: silinmemiş kullanıcının oturumu, bağlama ve e-posta değişikliği etkilenmez (koruma yalnız silinmişi reddeder)', async () => {
    const { harness, address, userId, headers } = await signedUpUser();
    const context = await harness.auth.$context;
    await context.internalAdapter.createSession(userId);
    await context.internalAdapter.linkAccount({
      userId,
      providerId: 'linkedin',
      accountId: `li-${randomUUID()}`,
    });
    const newAddress = uniqueAddress('ornek.test', 'yeni');
    await harness.auth.api.changeEmail({
      body: { newEmail: newAddress, callbackURL: '/' },
      headers,
    });
    const confirm =
      new URL(harness.sent.changeConfirmations[0]?.url ?? '').searchParams.get('token') ?? '';
    await harness.auth.api.verifyEmail({
      query: { token: confirm, callbackURL: '/' },
      headers,
      asResponse: true,
    });
    const verify =
      new URL(harness.sent.changeVerifications[0]?.url ?? '').searchParams.get('token') ?? '';
    await harness.auth.api.verifyEmail({
      query: { token: verify, callbackURL: '/' },
      headers,
      asResponse: true,
    });
    const after = await state(userId);
    expect(after.sessions).toBe(2);
    expect(after.accounts).toBe(1);
    expect(after.user).toMatchObject({ email: newAddress, emailVerified: true, deletedAt: null });
    expect(address).not.toBe(newAddress);
  });

  it('M11: silmeyle eşleşen bekleyen doğrulama kayıtları (kimlik ya da değer e-posta) silinir, başkasınınki kalır', async () => {
    const { address, userId } = await signedUpUser();
    const stranger = uniqueAddress('ornek.test', 'baskasi');
    const expiresAt = new Date(Date.now() + 600_000);
    await prisma.verification.createMany({
      data: [
        { identifier: address.toUpperCase(), value: 'x', expiresAt },
        {
          identifier: `token-${randomUUID()}`,
          value: JSON.stringify({ email: address.toUpperCase() }),
          expiresAt,
        },
        {
          identifier: `token-${randomUUID()}`,
          value: JSON.stringify({ email: stranger }),
          expiresAt,
        },
      ],
    });
    await del(userId, address);
    const rows = await prisma.verification.findMany({ select: { identifier: true, value: true } });
    const text = rows.map((row) => `${row.identifier} ${row.value}`).join('\n');
    expect(text.toLowerCase()).not.toContain(address.toLowerCase());
    expect(text).toContain(stranger);
  });

  it('M12: koruma adaptör düzeyindedir: silinmiş kullanıcı satırına update ve updateMany hiçbir şey yazmaz; canlı kullanıcıya yazar', async () => {
    const { address, userId } = await signedUpUser();
    const guarded = guardDeletedUsers(prisma);
    await guarded.user.update({ where: { id: userId }, data: { name: 'Canlı Ad' } });
    expect((await state(userId)).user.name).toBe('Canlı Ad');
    await del(userId, address);
    await expect(
      guarded.user.update({ where: { id: userId }, data: { name: 'Geri Gelen Ad' } }),
    ).rejects.toThrow();
    expect(
      (await guarded.user.updateMany({ where: { id: userId }, data: { name: 'Geri Gelen Ad' } }))
        .count,
    ).toBe(0);
    expect((await state(userId)).user.name).toBe(DELETED_USER_NAME);
  });

  it('M13: silme sürerken ESKİ adres onayı tıklanırsa yazılmaz ve yeni adrese e-posta gitmez; e-posta anonim kalır', async () => {
    const { harness, address, userId, headers } = await signedUpUser();
    await harness.auth.api.changeEmail({
      body: { newEmail: uniqueAddress('ornek.test', 'yeni'), callbackURL: '/' },
      headers,
    });
    const confirm =
      new URL(harness.sent.changeConfirmations[0]?.url ?? '').searchParams.get('token') ?? '';
    await whileDeletionOpen(userId, address, () =>
      harness.auth.api
        .verifyEmail({
          query: { token: confirm, callbackURL: '/' },
          headers: new Headers(),
          asResponse: true,
        })
        .catch(() => null),
    );
    const after = await state(userId);
    // Silinen hesap için yeni adrese doğrulama e-postası da gitmez.
    expect(harness.sent.changeVerifications).toHaveLength(0);
    expect(after.user.email).toBe(deletedEmailFor(userId));
    expect(after.user.name).toBe(DELETED_USER_NAME);
    expect(after.sessions).toBe(0);
  });
});

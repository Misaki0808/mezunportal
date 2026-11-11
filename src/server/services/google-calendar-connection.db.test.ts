import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
  type Institution,
} from '@/test/fixtures';

import { SecretBoxError, decryptSecret } from '../crypto/secret-box';
import { GOOGLE_CALENDAR_SCOPE, buildAuthorization } from '../external/calendar/google-oauth';
import {
  beginGoogleAuthorization,
  completeGoogleAuthorization,
  createGoogleTokenStore,
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  type GoogleConnectionDeps,
  type GoogleSettings,
} from './google-calendar-connection';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

const SECRET = 'sunucu-sirri-en-az-otuz-iki-karakter-uzunlugunda-1';
const REFRESH = '1//0gSECRET-yenileme-jetonu-ABC';
const ACCESS = 'ya29.SECRET-erisim-jetonu';
const APP = 'https://mezunportal.example';
const google: GoogleSettings = {
  mode: 'GOOGLE',
  clientId: 'istemci-kimligi',
  clientSecret: 'istemci-sirri',
  appUrl: APP,
  secret: SECRET,
};
let inst: Institution;
beforeAll(async () => {
  inst = await createInstitution(db);
});

async function systemAdmin() {
  const userId = await createUser(db);
  await addMembership(db, { userId, departmentId: inst.deptA1, role: 'ACADEMIC' });
  await addGrant(db, { userId, scope: 'SYSTEM' });
  await grantRequiredConsents(db, userId);
  return userId;
}
async function otherUser(kind: 'student' | 'deptAdmin') {
  const userId = await createUser(db);
  await addMembership(db, {
    userId,
    departmentId: inst.deptA1,
    role: kind === 'student' ? 'STUDENT' : 'ACADEMIC',
    ...(kind === 'student' ? { entryYear: 2024 } : {}),
  });
  if (kind === 'deptAdmin')
    await addGrant(db, { userId, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  await grantRequiredConsents(db, userId);
  return userId;
}
async function clearConnection() {
  await db.integrationConnection.deleteMany({});
}

type Reply = Response | Error;
function fetchMock(replies: Reply[]) {
  const calls: { url: string; body: string }[] = [];
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), body: init.body ? String(init.body) : '' });
    const next = replies.shift();
    if (!next) throw new Error('beklenmeyen istek ' + String(url));
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { impl, calls };
}
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const tokenReply = () =>
  json(200, {
    refresh_token: REFRESH,
    access_token: ACCESS,
    scope: `openid ${GOOGLE_CALENDAR_SCOPE}`,
  });
const labelReply = () => json(200, { summary: 'platform@gmail.com' });

function deps(
  over: Omit<Partial<GoogleConnectionDeps>, 'settings'> & { settings?: GoogleSettings } = {},
): GoogleConnectionDeps {
  const { settings = google, ...rest } = over;
  return { db, settings: () => settings, ...rest };
}
const forbidden = async (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (isCodedError(error) ? error.code : 'HATA'),
  );
/** Yöneticinin tarayıcısında başlayan akış: çerez + state. */
function begun(userId: string, now = new Date()) {
  const start = buildAuthorization({
    clientId: google.clientId!,
    appUrl: APP,
    secret: SECRET,
    userId,
    now: now.getTime(),
  });
  return { state: start.nonce, cookieValue: start.cookie.value };
}

describe('bağlama: tek seferlik OAuth ve şifreli saklama', () => {
  it('başarılı dönüş: yenileme jetonu ŞİFRELİ saklanır, geri çözülür; etiket, durum ve işlem kaydı yazılır', async () => {
    await clearConnection();
    const admin = await systemAdmin();
    const f = fetchMock([tokenReply(), labelReply()]);
    const changed = vi.fn();
    const flow = begun(admin);
    const outcome = await completeGoogleAuthorization(
      deps({ fetchImpl: f.impl, onChanged: changed }),
      admin,
      {
        code: 'yetki-kodu',
        state: flow.state,
        error: null,
        cookieValue: flow.cookieValue,
      },
    );
    expect(outcome).toBe('connected');
    expect(changed).toHaveBeenCalledTimes(1);
    const row = await db.integrationConnection.findUniqueOrThrow({
      where: { provider: 'GOOGLE_CALENDAR' },
    });
    expect(row).toMatchObject({
      status: 'ACTIVE',
      accountLabel: 'platform@gmail.com',
      connectedById: admin,
    });
    expect(row.scope).toContain(GOOGLE_CALENDAR_SCOPE);
    expect(row.refreshTokenEnc).not.toContain(REFRESH);
    expect(
      decryptSecret(
        row.refreshTokenEnc,
        SECRET,
        'IntegrationConnection:GOOGLE_CALENDAR:refreshToken',
      ),
    ).toBe(REFRESH);
    // başka bağlamda çözülmez (şifreli değer başka alana kopyalanamaz)
    expect(() => decryptSecret(row.refreshTokenEnc, SECRET, 'baska')).toThrow(SecretBoxError);
    const audit = await db.adminAuditLog.findFirstOrThrow({
      where: { actorId: admin, action: 'INTEGRATION_CONNECT' },
    });
    expect(audit).toMatchObject({ targetType: 'INTEGRATION', targetId: 'GOOGLE_CALENDAR' });
    expect(JSON.stringify(audit)).not.toContain(REFRESH);
    expect(JSON.stringify(audit)).not.toContain(ACCESS);
  });

  it('veritabanı kısıtı: düz metin jeton saklanamaz (biçim CHECK)', async () => {
    await clearConnection();
    const admin = await systemAdmin();
    await expect(
      db.integrationConnection.create({
        data: {
          provider: 'GOOGLE_CALENDAR',
          refreshTokenEnc: REFRESH,
          scope: GOOGLE_CALENDAR_SCOPE,
          connectedById: admin,
        },
      }),
    ).rejects.toThrow();
  });

  it('yeniden bağlama aynı satırı günceller (sağlayıcı başına tek kayıt) ve durumu ACTIVE yapar', async () => {
    await clearConnection();
    const admin = await systemAdmin();
    for (let i = 0; i < 2; i += 1) {
      const flow = begun(admin);
      await completeGoogleAuthorization(
        deps({ fetchImpl: fetchMock([tokenReply(), labelReply()]).impl }),
        admin,
        {
          code: 'kod',
          state: flow.state,
          error: null,
          cookieValue: flow.cookieValue,
        },
      );
      if (i === 0)
        await db.integrationConnection.updateMany({ data: { status: 'NEEDS_RECONNECT' } });
    }
    expect(await db.integrationConnection.count()).toBe(1);
    expect((await db.integrationConnection.findFirstOrThrow()).status).toBe('ACTIVE');
  });

  it("state uyuşmazlığı, başka yöneticinin çerezi ve süresi dolmuş çerez reddedilir; Google'a hiç gidilmez, satır oluşmaz", async () => {
    await clearConnection();
    const admin = await systemAdmin();
    const other = await systemAdmin();
    const flow = begun(admin);
    const stale = begun(admin, new Date(Date.now() - 11 * 60 * 1000));
    const cases = [
      { ...flow, state: 'sahte-state' },
      begun(other),
      stale,
      { state: flow.state, cookieValue: null },
    ];
    for (const attempt of cases) {
      const f = fetchMock([]);
      const outcome = await completeGoogleAuthorization(deps({ fetchImpl: f.impl }), admin, {
        code: 'kod',
        error: null,
        ...attempt,
      });
      expect(outcome).toBe('invalid');
      expect(f.calls).toHaveLength(0);
    }
    expect(await db.integrationConnection.count()).toBe(0);
  });

  it('Google reddi, değişim hatası, yenileme jetonu/kapsam yokluğu ve yapılandırma yokluğu özetlenmiş sonuç verir; satır oluşmaz', async () => {
    await clearConnection();
    const admin = await systemAdmin();
    const run = async (
      replies: Reply[],
      over: Partial<{ error: string | null; code: string | null }> = {},
      settings = google,
    ) => {
      const flow = begun(admin);
      return completeGoogleAuthorization(
        deps({ fetchImpl: fetchMock(replies).impl, settings }),
        admin,
        {
          code: 'kod',
          error: null,
          state: flow.state,
          cookieValue: flow.cookieValue,
          ...over,
        },
      );
    };
    expect(await run([], { error: 'access_denied' })).toBe('denied');
    expect(await run([], { error: 'server_error' })).toBe('failed');
    expect(await run([json(400, { error: 'invalid_grant' })])).toBe('failed');
    expect(await run([json(200, { access_token: ACCESS, scope: GOOGLE_CALENDAR_SCOPE })])).toBe(
      'failed',
    );
    expect(
      await run([json(200, { refresh_token: REFRESH, access_token: ACCESS, scope: 'openid' })]),
    ).toBe('failed');
    expect(await run([], { code: null })).toBe('invalid');
    expect(await run([], {}, { ...google, mode: 'FAKE' })).toBe('not-configured');
    expect(await run([], {}, { ...google, clientSecret: null })).toBe('not-configured');
    expect(await db.integrationConnection.count()).toBe(0);
  });

  it('yalnız sistem yöneticisi bağlar: öğrenci ve bölüm yöneticisi reddedilir, durum çerezi yetki vermez', async () => {
    await clearConnection();
    for (const kind of ['student', 'deptAdmin'] as const) {
      const user = await otherUser(kind);
      const flow = begun(user);
      expect(await forbidden(beginGoogleAuthorization(deps(), user))).toBe('AUTH_FORBIDDEN');
      expect(
        await forbidden(
          completeGoogleAuthorization(deps({ fetchImpl: fetchMock([]).impl }), user, {
            code: 'kod',
            error: null,
            ...flow,
          }),
        ),
      ).toBe('AUTH_FORBIDDEN');
    }
    expect(await db.integrationConnection.count()).toBe(0);
  });

  it('başlangıç: yapılandırma varsa adres + çerez, yoksa null', async () => {
    const admin = await systemAdmin();
    const start = await beginGoogleAuthorization(deps(), admin);
    expect(start?.url).toContain('accounts.google.com');
    expect(
      await beginGoogleAuthorization(deps({ settings: { ...google, mode: 'OFF' } }), admin),
    ).toBeNull();
    expect(
      await beginGoogleAuthorization(deps({ settings: { ...google, clientId: null } }), admin),
    ).toBeNull();
  });
});

describe('durum ve bağlantıyı kesme', () => {
  async function connect(admin: string) {
    const flow = begun(admin);
    await completeGoogleAuthorization(
      deps({ fetchImpl: fetchMock([tokenReply(), labelReply()]).impl }),
      admin,
      {
        code: 'kod',
        error: null,
        ...flow,
      },
    );
  }

  it('durum: kapalı/sahte/anahtarsız/bağlı değil/bağlı/yeniden bağla ayrımı; yenileme jetonu yanıtta yok', async () => {
    await clearConnection();
    const admin = await systemAdmin();
    const status = (settings: GoogleSettings = google) =>
      getGoogleCalendarStatus(deps({ settings }), admin);
    expect(await status({ ...google, mode: 'OFF' })).toMatchObject({
      mode: 'OFF',
      configured: false,
      connection: 'NONE',
      redirectUri: null,
    });
    expect(await status({ ...google, mode: 'FAKE' })).toMatchObject({
      mode: 'FAKE',
      connection: 'NONE',
    });
    expect(await status({ ...google, clientId: null })).toMatchObject({
      mode: 'GOOGLE',
      configured: false,
    });
    expect(await status()).toMatchObject({
      mode: 'GOOGLE',
      configured: true,
      connection: 'NONE',
      redirectUri: 'https://mezunportal.example/api/google/callback',
    });
    await connect(admin);
    const connected = await status();
    expect(connected).toMatchObject({ connection: 'ACTIVE', accountLabel: 'platform@gmail.com' });
    expect(connected.connectedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(connected)).not.toContain(REFRESH);
    await db.integrationConnection.updateMany({ data: { status: 'NEEDS_RECONNECT' } });
    expect((await status()).connection).toBe('NEEDS_RECONNECT');
    expect(await forbidden(getGoogleCalendarStatus(deps(), await otherUser('student')))).toBe(
      'AUTH_FORBIDDEN',
    );
  });

  it("kesme: satır silinir, jeton Google'da iptal edilir, işlem kaydı yazılır; tekrar kesme sorunsuz", async () => {
    await clearConnection();
    const admin = await systemAdmin();
    await connect(admin);
    const f = fetchMock([new Response(null, { status: 200 })]);
    const changed = vi.fn();
    const result = await disconnectGoogleCalendar(
      deps({ fetchImpl: f.impl, onChanged: changed }),
      admin,
    );
    expect(result).toEqual({ disconnected: true, revoked: true });
    expect(changed).toHaveBeenCalled();
    expect(await db.integrationConnection.count()).toBe(0);
    expect(f.calls[0]!.url).toBe('https://oauth2.googleapis.com/revoke');
    expect(new URLSearchParams(f.calls[0]!.body).get('token')).toBe(REFRESH);
    expect(
      await db.adminAuditLog.count({ where: { actorId: admin, action: 'INTEGRATION_DISCONNECT' } }),
    ).toBe(1);
    const again = await disconnectGoogleCalendar(deps({ fetchImpl: fetchMock([]).impl }), admin);
    expect(again).toEqual({ disconnected: true, revoked: false });
    expect(
      await db.adminAuditLog.count({ where: { actorId: admin, action: 'INTEGRATION_DISCONNECT' } }),
    ).toBe(1);
  });

  it('Google iptali başarısız olsa da yerel bağlantı kesilir; yetkisiz kullanıcı kesemez', async () => {
    await clearConnection();
    const admin = await systemAdmin();
    await connect(admin);
    const student = await otherUser('student');
    expect(
      await forbidden(disconnectGoogleCalendar(deps({ fetchImpl: fetchMock([]).impl }), student)),
    ).toBe('AUTH_FORBIDDEN');
    expect(await db.integrationConnection.count()).toBe(1);
    const result = await disconnectGoogleCalendar(
      deps({ fetchImpl: fetchMock([new TypeError('ağ')]).impl }),
      admin,
    );
    expect(result).toEqual({ disconnected: true, revoked: false });
    expect(await db.integrationConnection.count()).toBe(0);
  });
});

describe('adaptörün jeton deposu', () => {
  it('etkin bağlantıda düz jeton döner; yok/yeniden-bağla durumunda null', async () => {
    await clearConnection();
    const admin = await systemAdmin();
    const store = createGoogleTokenStore(db, SECRET);
    expect(await store.loadRefreshToken()).toBeNull();
    const flow = begun(admin);
    await completeGoogleAuthorization(
      deps({ fetchImpl: fetchMock([tokenReply(), labelReply()]).impl }),
      admin,
      {
        code: 'kod',
        error: null,
        ...flow,
      },
    );
    expect(await store.loadRefreshToken()).toBe(REFRESH);
    await store.markRejected();
    expect(await store.loadRefreshToken()).toBeNull();
    expect(await db.integrationConnection.findFirstOrThrow()).toMatchObject({
      status: 'NEEDS_RECONNECT',
      lastErrorCode: 'GOOGLE_TOKEN_REJECTED',
    });
  });

  it('sunucu sırrı değişince kayıt çözülemez: yeniden bağla durumuna alınır, hata ve log jeton taşımaz', async () => {
    await clearConnection();
    const admin = await systemAdmin();
    const flow = begun(admin);
    await completeGoogleAuthorization(
      deps({ fetchImpl: fetchMock([tokenReply(), labelReply()]).impl }),
      admin,
      {
        code: 'kod',
        error: null,
        ...flow,
      },
    );
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const rotated = createGoogleTokenStore(db, 'yeni-sunucu-sirri-en-az-otuz-iki-karakter-2');
    expect(await rotated.loadRefreshToken()).toBeNull();
    expect(await db.integrationConnection.findFirstOrThrow()).toMatchObject({
      status: 'NEEDS_RECONNECT',
      lastErrorCode: 'GOOGLE_TOKEN_UNREADABLE',
    });
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(REFRESH);
      spy.mockRestore();
    }
  });
});

describe('bağlama akışı gizliliği', () => {
  it('log, hata ve işlem kaydı jeton/kod taşımaz', async () => {
    await clearConnection();
    const admin = await systemAdmin();
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const flow = begun(admin);
    await completeGoogleAuthorization(
      deps({ fetchImpl: fetchMock([tokenReply(), labelReply()]).impl }),
      admin,
      {
        code: 'GIZLI-YETKI-KODU',
        error: null,
        ...flow,
      },
    );
    await disconnectGoogleCalendar(
      deps({ fetchImpl: fetchMock([new Response(null, { status: 200 })]).impl }),
      admin,
    );
    const dump =
      JSON.stringify(spies.map((s) => s.mock.calls)) +
      JSON.stringify(await db.adminAuditLog.findMany({ where: { actorId: admin } }));
    for (const secret of [REFRESH, ACCESS, 'GIZLI-YETKI-KODU', 'istemci-sirri'])
      expect(dump, secret).not.toContain(secret);
    for (const spy of spies) spy.mockRestore();
  });
});

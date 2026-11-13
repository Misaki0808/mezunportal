import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adapter: vi.fn(),
  client: vi.fn(),
  user: vi.fn(),
  transaction: vi.fn(),
  actor: vi.fn(),
  disconnect: vi.fn(),
}));

// No environment file or real database/network is consulted by these script tests.
vi.mock('node:fs', () => ({ existsSync: () => false }));
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor(options: unknown) {
      mocks.adapter(options);
    }
  },
}));
vi.mock('../generated/prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      mocks.client();
    }
    user = { findFirstOrThrow: mocks.user };
    $transaction = mocks.transaction;
    $disconnect = mocks.disconnect;
  },
}));
vi.mock('../server/permissions/actor', () => ({ loadActor: mocks.actor }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: 'probe-fixture' });
  mocks.transaction.mockImplementation(async (read: (tx: object) => Promise<unknown>) => read({}));
  mocks.actor.mockResolvedValue({ userId: 'probe-fixture' });
  mocks.disconnect.mockResolvedValue(undefined);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it.each([
  ['eksik', undefined],
  ['bozuk', 'not-a-database-url'],
  ['yanlış protokol', 'https://localhost/fixture'],
  ['uzak host', 'postgresql://probe:fixture-secret@db.invalid/fixture'],
  ['yerel adın sonuna ek', 'postgresql://localhost.invalid/fixture'],
  ['yanıltıcı kullanıcı bilgisi', 'postgresql://localhost@db.invalid/fixture'],
  ['query host değişimi', 'postgresql://localhost/fixture?host=db.invalid'],
  ['yinelenen host', 'postgresql://localhost/fixture?host=localhost&host=db.invalid'],
  ['hostaddr değişimi', 'postgresql://127.0.0.1/fixture?hostaddr=203.0.113.1'],
])('bağlantı kurmadan reddeder: %s', async (_label, value) => {
  vi.stubEnv('DATABASE_URL', value);
  await expect(import('../../scripts/td027-probe')).rejects.toThrow(
    /^TD-027 yalnız yerel PostgreSQL adresiyle çalışır$/,
  );
  expect(mocks.adapter.mock.calls.length).toBe(0);
  expect(mocks.client.mock.calls.length).toBe(0);
  expect(mocks.user.mock.calls.length).toBe(0);
});

it.each([
  ['IPv4', 'postgresql://127.0.0.1:5432/fixture'],
  ['localhost', 'postgres://localhost/fixture'],
  ['IPv6', 'postgresql://[::1]/fixture'],
  ['SSL seçeneği', 'postgresql://127.0.0.1/fixture?sslmode=disable'],
])('yerel hedefte okur ve bağlantıyı kapatır: %s', async (_label, value) => {
  vi.stubEnv('DATABASE_URL', value);
  await import('../../scripts/td027-probe');
  expect(mocks.adapter).toHaveBeenCalledWith({ connectionString: value });
  expect(mocks.user).toHaveBeenCalledWith({
    where: { memberships: { some: { endedAt: null } } },
    select: { id: true },
  });
  expect(mocks.actor).toHaveBeenCalledOnce();
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(process.stdout.write).toHaveBeenCalledWith('TD-027: 0 pg uyarısı\n');
});

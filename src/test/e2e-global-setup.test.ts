import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  return { query, connect: vi.fn(), end: vi.fn(), exec: vi.fn(), rm: vi.fn() };
});
vi.mock('pg', () => ({
  default: {
    Client: vi.fn(function () {
      return mocks;
    }),
  },
}));
vi.mock('node:child_process', () => ({ execFileSync: mocks.exec }));
vi.mock('node:fs/promises', () => ({ rm: mocks.rm }));

import globalSetup from '../../tests/e2e/global-setup';
import type { FullConfig } from '@playwright/test';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('E2E DB temizliği', () => {
  it('yalnız sahipsiz koşuları siler, kilitli koşuyu ve başka adları korur; kendi DBlerini bitişte siler', async () => {
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('E2E_ISOLATION_RUN', 'aaaaaaaaaaaa');
    vi.stubEnv('E2E_ORIGINAL_DATABASE_URL', 'postgresql://test:test@localhost:5432/mezun_w2');
    const prefix = 'mezun_w2_e2e_';
    const orphan = `${prefix}bbbbbbbbbbbb_0_test`;
    const active = `${prefix}cccccccccccc_0_test`;
    const other = `${prefix}dddddddddddd_0_test_backup`;
    mocks.query.mockImplementation(async (sql: string, values?: string[]) => {
      if (sql.includes('FROM pg_database'))
        return { rows: [orphan, active, other].map((datname) => ({ datname })) };
      if (sql.includes('pg_try_advisory_lock'))
        return { rows: [{ acquired: !values?.[0]?.endsWith('cccccccccccc') }] };
      return { rows: [] };
    });
    const cleanup = await globalSetup({ workers: 2 } as FullConfig);
    const before = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(before).toContain(`DROP DATABASE IF EXISTS "${orphan}" WITH (FORCE)`);
    expect(before.some((sql) => sql.includes(`DROP DATABASE IF EXISTS "${active}"`))).toBe(false);
    expect(before.some((sql) => sql.includes(`DROP DATABASE IF EXISTS "${other}"`))).toBe(false);
    expect(before.some((sql) => sql.includes('pg_advisory_lock('))).toBe(true);
    expect(mocks.exec).toHaveBeenCalledTimes(4);
    await cleanup();
    const after = mocks.query.mock.calls.map(([sql]) => String(sql));
    expect(after).toContain(`DROP DATABASE IF EXISTS "${prefix}aaaaaaaaaaaa_0_test" WITH (FORCE)`);
    expect(after).toContain(`DROP DATABASE IF EXISTS "${prefix}aaaaaaaaaaaa_1_test" WITH (FORCE)`);
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});

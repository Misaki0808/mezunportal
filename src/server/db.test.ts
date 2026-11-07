import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pingDatabase } from '@/server/db';

// Kimliği ve parolası olan, ulaşılamayan bir adres: ping başarısız olmalı ve hiçbir yere sızmamalı.
const UNREACHABLE = 'postgresql://kullanici:cok-gizli-parola@127.0.0.1:1/yok';

beforeEach(() => {
  vi.stubEnv('APP_ENV', 'test');
  vi.stubEnv('APP_URL', 'http://localhost:3100');
  vi.stubEnv('DATABASE_URL', UNREACHABLE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('pingDatabase', () => {
  it('ulaşılamayan veritabanında false döner ve günlüğe adres/parola yazmaz', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(pingDatabase()).resolves.toBe(false);

    const output = JSON.stringify(logged.mock.calls);
    expect(output).not.toContain('cok-gizli-parola');
    expect(output).not.toContain('kullanici');
    expect(output).not.toContain('127.0.0.1');
  });
});

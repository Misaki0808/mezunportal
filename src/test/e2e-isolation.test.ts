import { afterEach, describe, expect, it, vi } from 'vitest';
import { isolationRunId, workerBaseUrl, workerDatabaseUrl } from '../../tests/e2e/isolation';

afterEach(() => vi.unstubAllEnvs());
describe('E2E geçici ortam güvenliği', () => {
  function local() {
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('E2E_ISOLATION_RUN', 'abcdef123456');
    vi.stubEnv('E2E_ORIGINAL_DATABASE_URL', 'postgresql://test:test@localhost:5432/mezun_e2e');
    vi.stubEnv('E2E_ORIGINAL_APP_URL', 'http://localhost:3200');
  }
  it('işçilere farklı, yalnız test için adlandırılmış DB ve adresler verir', () => {
    local();
    expect(new URL(workerDatabaseUrl(0)).pathname).toBe('/mezun_e2e_e2e_abcdef123456_0_test');
    expect(workerDatabaseUrl(0)).not.toBe(workerDatabaseUrl(1));
    expect(workerBaseUrl(0)).toBe('http://127.0.0.1:3200');
    expect(workerBaseUrl(1)).toBe('http://127.0.0.1:23200');
    expect(() => workerDatabaseUrl(2)).toThrow();
  });
  it('canlı ortamı, uzak DB adresini ve güvensiz koşu kimliğini reddeder', () => {
    local();
    vi.stubEnv('APP_ENV', 'prod');
    expect(() => workerDatabaseUrl(0)).toThrow('canlı');
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('E2E_ORIGINAL_DATABASE_URL', 'postgresql://test:test@remote.example/mezun');
    expect(() => workerDatabaseUrl(0)).toThrow('yerel');
    vi.stubEnv('E2E_ISOLATION_RUN', '../../tehlikeli');
    expect(() => isolationRunId()).toThrow('kimliği');
  });
});

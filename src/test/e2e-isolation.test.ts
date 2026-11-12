import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  e2eDatabasePrefix,
  e2eRunFromDatabase,
  e2eWorkerCount,
  isolationRunId,
  workerBaseUrl,
  workerDatabaseUrl,
} from '../../tests/e2e/isolation';

afterEach(() => vi.unstubAllEnvs());
describe('E2E geçici ortam güvenliği', () => {
  it('tek işçi varsayılan, iki işçi açık seçimdir ve CLI daha fazlasını açamaz', () => {
    expect(e2eWorkerCount(undefined, [])).toBe(1);
    expect(e2eWorkerCount('2', [])).toBe(2);
    expect(e2eWorkerCount('2', ['--workers=1'])).toBe(1);
    expect(e2eWorkerCount('2', ['--workers', '2'])).toBe(2);
    expect(() => e2eWorkerCount(undefined, ['--workers=2'])).toThrow('E2E_WORKERS=2');
    expect(() => e2eWorkerCount('2', ['--workers=3'])).toThrow();
    expect(() => e2eWorkerCount('3', [])).toThrow();
  });
  it('yalnız ilgili worktree ve sıkı geçici adlarla eşleşir', () => {
    const prefix = e2eDatabasePrefix('postgresql://localhost/mezun_w2_e2e_deadbeef0001_0_test');
    expect(prefix).toBe('mezun_w2_e2e_');
    expect(e2eRunFromDatabase('mezun_w2_e2e_deadbeef0001_0_test', prefix)).toBe('deadbeef0001');
    expect(e2eRunFromDatabase('mezun_w1_e2e_deadbeef0001_0_test', prefix)).toBeUndefined();
    expect(e2eRunFromDatabase('mezun_w2_e2e_deadbeef0001_0_test_backup', prefix)).toBeUndefined();
    expect(e2eRunFromDatabase('mezun_w2_e2e_deadbeef0001_2_test', prefix)).toBeUndefined();
  });
  it('her spec işçi izolasyon fikstürünü kullanır', () => {
    const directory = path.join(process.cwd(), 'tests/e2e');
    const specs = readdirSync(directory).filter((file) => file.endsWith('.spec.ts'));
    expect(specs.length).toBeGreaterThan(0);
    for (const file of specs) {
      const source = readFileSync(path.join(directory, file), 'utf8');
      expect(source, file).toMatch(/from ['"]\.\/fixture['"]/u);
      expect(source, file).not.toMatch(
        /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"]@playwright\/test['"]/su,
      );
    }
  });
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

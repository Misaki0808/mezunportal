import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildHealth } from '@/lib/health';
import { pingDatabase } from '@/server/db';

import { GET } from './route';

vi.mock('@/server/db', () => ({ pingDatabase: vi.fn() }));

const SECRET_URL = 'postgresql://mezun:cok-gizli@127.0.0.1:5432/mezun_x';

beforeEach(() => {
  vi.stubEnv('APP_ENV', 'test');
  vi.stubEnv('APP_URL', 'http://localhost:3100');
  vi.stubEnv('GIT_SHA', '');
  vi.stubEnv('DATABASE_URL', SECRET_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('buildHealth', () => {
  it('veritabanı ulaşılabilirse db "ok" ve sha "local"', () => {
    expect(buildHealth({ APP_ENV: 'local', GIT_SHA: undefined }, true)).toEqual({
      status: 'ok',
      sha: 'local',
      env: 'local',
      db: 'ok',
    });
  });

  it('GIT_SHA varsa onu döner', () => {
    expect(buildHealth({ APP_ENV: 'prod', GIT_SHA: 'abc1234' }, true)).toMatchObject({
      sha: 'abc1234',
      env: 'prod',
    });
  });

  it('veritabanı kapalıysa kararlı hata kodu döner', () => {
    expect(buildHealth({ APP_ENV: 'local', GIT_SHA: undefined }, false)).toEqual({
      status: 'error',
      sha: 'local',
      env: 'local',
      db: 'down',
      errorCode: 'DB_UNAVAILABLE',
    });
  });
});

describe('GET /api/health', () => {
  it('veritabanı açıkken 200, status/sha/env/db alanları, önbelleksiz', async () => {
    vi.mocked(pingDatabase).mockResolvedValue(true);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', sha: 'local', env: 'test', db: 'ok' });
  });

  it('veritabanı kapalıyken 503 ve anlamlı hata; adres/kimlik bilgisi sızmaz', async () => {
    vi.mocked(pingDatabase).mockResolvedValue(false);

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({
      status: 'error',
      db: 'down',
      errorCode: 'DB_UNAVAILABLE',
    });
    expect(text).not.toContain('cok-gizli');
    expect(text).not.toContain('127.0.0.1');
  });

  it('env geçersizse yanıt vermez, hata fırlatır', async () => {
    vi.stubEnv('APP_ENV', '');

    await expect(GET()).rejects.toThrow();
  });
});

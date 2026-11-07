import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildHealth } from '@/lib/health';

import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildHealth', () => {
  it('GIT_SHA yoksa sha "local" döner', () => {
    expect(buildHealth({ APP_ENV: 'local', GIT_SHA: undefined })).toEqual({
      status: 'ok',
      sha: 'local',
      env: 'local',
    });
  });

  it('GIT_SHA varsa onu döner', () => {
    expect(buildHealth({ APP_ENV: 'prod', GIT_SHA: 'abc1234' })).toMatchObject({
      sha: 'abc1234',
      env: 'prod',
    });
  });
});

describe('GET /api/health', () => {
  it('status, sha ve env alanlarını önbelleksiz döner', async () => {
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('APP_URL', 'http://localhost:3100');
    vi.stubEnv('GIT_SHA', '');

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', sha: 'local', env: 'test' });
  });

  it('env geçersizse yanıt vermez, hata fırlatır', () => {
    vi.stubEnv('APP_ENV', '');
    vi.stubEnv('APP_URL', 'http://localhost:3100');

    expect(() => GET()).toThrow();
  });
});

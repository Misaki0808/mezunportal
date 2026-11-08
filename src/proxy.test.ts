import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';
afterEach(() => vi.unstubAllEnvs());
describe('canlıda geliştirme yolları', () => {
  it.each(['/giris/test?persona=student', '/ui-ornekleri', '/ui-ornekleri/alt'])(
    'prod %s için gerçek 404 verir',
    (path) => {
      vi.stubEnv('APP_ENV', 'prod');
      expect(proxy(new NextRequest(`http://localhost${path}`)).status).toBe(404);
    },
  );
  it.each(['local', 'test'])('%s ortamında yolu engellemez', (env) => {
    vi.stubEnv('APP_ENV', env);
    expect(proxy(new NextRequest('http://localhost/ui-ornekleri')).status).toBe(200);
  });
});

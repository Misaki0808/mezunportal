import { afterEach, describe, expect, it, vi } from 'vitest';

import UiExamplesPage from './page';

// Galeri bileşeni ağırdır ve burada sınanan şey değil: yalnız kapı sınanır.
vi.mock('./gallery', () => ({ Gallery: () => null }));

afterEach(() => {
  vi.unstubAllEnvs();
});

function notFoundDigest(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
  return undefined;
}

describe('/ui-ornekleri', () => {
  it('prod ortamında 404 verir', () => {
    vi.stubEnv('APP_ENV', 'prod');
    expect(notFoundDigest(UiExamplesPage)).toContain('404');
  });

  it('APP_ENV tanımsızsa 404 verir (güvenli taraf)', () => {
    vi.stubEnv('APP_ENV', '');
    expect(notFoundDigest(UiExamplesPage)).toContain('404');
  });

  it.each(['local', 'test'])('%s ortamında açılır', (appEnv) => {
    vi.stubEnv('APP_ENV', appEnv);
    expect(notFoundDigest(UiExamplesPage)).toBeUndefined();
  });
});

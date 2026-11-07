import { afterEach, describe, expect, it, vi } from 'vitest';

import TestSignInPage from './page';

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/server/actions/auth', () => ({ signInAsTestPersona: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

describe('/giris/test', () => {
  it.each(['prod', ''])('%s ortamında test girişi 404 verir', async (appEnv) => {
    vi.stubEnv('APP_ENV', appEnv);
    await expect(
      TestSignInPage({ searchParams: Promise.resolve({ persona: 'student' }) }),
    ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
  });
  it('geçersiz rolü reddeder', async () => {
    vi.stubEnv('APP_ENV', 'local');
    await expect(
      TestSignInPage({ searchParams: Promise.resolve({ persona: 'unknown' }) }),
    ).rejects.toMatchObject({ digest: expect.stringContaining('404') });
  });
  it('yerel ortamda geçerli test hesabını sunar', async () => {
    vi.stubEnv('APP_ENV', 'local');
    await expect(
      TestSignInPage({ searchParams: Promise.resolve({ persona: 'student' }) }),
    ).resolves.toBeDefined();
  });
});

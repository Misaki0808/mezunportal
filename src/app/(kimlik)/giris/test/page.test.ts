import { renderToStaticMarkup } from 'react-dom/server';
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
  it('rol verilmezse prod/boş ortamda yine 404 verir', async () => {
    vi.stubEnv('APP_ENV', 'prod');
    await expect(TestSignInPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });
  it('yerelde rol verilmezse altı rolü listeler ve dönüş yolunu bağlara taşır', async () => {
    vi.stubEnv('APP_ENV', 'local');
    const page = await TestSignInPage({ searchParams: Promise.resolve({ donus: '/ilanlar' }) });
    const html = renderToStaticMarkup(page);
    expect(html.match(/href="\/giris\/test\?persona=/g)).toHaveLength(6);
    expect(html).toContain('persona=student&amp;donus=%2Filanlar');
  });
});

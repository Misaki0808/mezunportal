import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TEST_LOGIN_PERSONAS } from '@/contracts/auth';

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
    await expect(TestSignInPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
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
  it.each(['local', 'test'])(
    '%s ortamında altı rolü ve güvenli dönüş yolunu gösterir',
    async (appEnv) => {
      vi.stubEnv('APP_ENV', appEnv);
      const markup = renderToStaticMarkup(
        await TestSignInPage({ searchParams: Promise.resolve({ donus: '/hesap/bildirimler' }) }),
      );
      for (const persona of TEST_LOGIN_PERSONAS) {
        expect(markup).toContain(`persona=${persona}&amp;donus=%2Fhesap%2Fbildirimler`);
        expect(markup).toContain(`personas.${persona}`);
      }
      expect((markup.match(/<a\s/g) ?? []).length).toBe(6);
    },
  );
  it('geçersiz dönüş hedefi rol bağlantılarına taşınmaz', async () => {
    vi.stubEnv('APP_ENV', 'local');
    const markup = renderToStaticMarkup(
      await TestSignInPage({ searchParams: Promise.resolve({ donus: '//evil.example' }) }),
    );
    expect(markup).not.toContain('evil.example');
    expect(markup).not.toContain('donus=');
  });
});

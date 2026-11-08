import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('@/components/privacy/server-guard', () => ({ PrivacyGuard: () => null }));
vi.mock('@/server/actions/contact-request', () => ({ previewContactTarget: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));

import Page from './page';

/** Sayfa `<PrivacyGuard><ContactTarget returnTo=… /></PrivacyGuard>` döndürür; geri bağlantısı hedefi `returnTo` prop'udur. */
async function returnToOf(donus: string | string[] | undefined): Promise<string | null> {
  const element = (await Page({
    params: Promise.resolve({ userId: 'hedef' }),
    searchParams: Promise.resolve(donus === undefined ? {} : { donus }),
  })) as ReactElement<{ children: ReactElement<{ returnTo: string | null }> }>;
  return element.props.children.props.returnTo;
}

describe('iletişim isteği geri bağlantısı (açık yönlendirme yok)', () => {
  it('güvenli site içi yolu kaynak olarak taşır', async () => {
    expect(await returnToOf('/mentorlar?tur=ALUMNI')).toBe('/mentorlar?tur=ALUMNI');
    expect(await returnToOf('/uye/abc')).toBe('/uye/abc');
  });

  it.each([
    '//kotu.example',
    '/\\kotu.example',
    'https://kotu.example/hesap',
    'javascript:alert(1)',
    '/%2f%2fkotu.example',
    '/%252f%252fkotu.example',
    '/giris',
  ])('güvensiz %s reddedilir (Hesabım varsayılanına döner)', async (value) => {
    expect(await returnToOf(value)).toBeNull();
  });

  it('parametre yok ya da tekrarlıysa kaynak yoktur', async () => {
    expect(await returnToOf(undefined)).toBeNull();
    expect(await returnToOf(['/mentorlar', '//kotu.example'])).toBeNull();
  });
});

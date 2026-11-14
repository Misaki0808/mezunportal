// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { codedForbidden, codedNotFound, codedUnauthenticated } from '@/lib/errors';
import { ErrorState } from '@/components/ui/error-state';
import { renderUi } from '@/test/render';
import { guardPage } from './page-guard';

vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => '/hesap/cv-inceleme',
}));

it.each([
  [
    codedUnauthenticated('AUTH_UNAUTHENTICATED'),
    'Giriş yapman gerekiyor',
    'Giriş yap',
    '/giris?donus=%2Fhesap%2Fcv-inceleme',
  ],
  [codedForbidden('AUTH_FORBIDDEN'), 'Bu sayfa senin rolün için değil', 'Ana sayfaya dön', '/'],
  [
    codedForbidden('AUTH_NOT_VERIFIED'),
    'Üyeliğini doğrulaman gerekiyor',
    'Doğrulamaya git',
    '/dogrulama',
  ],
  [codedForbidden('AUTH_ACCOUNT_SUSPENDED'), 'Hesabın askıda', 'Ana sayfaya dön', '/'],
  [
    codedForbidden('CONSENT_REQUIRED'),
    'Önce metinleri onaylaman gerekiyor',
    'Onay ekranına git',
    '/onay',
  ],
  [codedNotFound('RESOURCE_NOT_FOUND'), 'Aradığın sayfa bulunamadı', 'Ana sayfaya dön', '/'],
] as const)(
  '%s: gerçek koruma → katalogdaki başlık ve doğru bağlantı',
  async (error, title, label, href) => {
    const guarded = await guardPage('page.test', async () => {
      throw error;
    });
    expect(guarded.ok).toBe(false);
    if (guarded.ok) throw new Error('Ret, içerik açmamalı');
    renderUi(<ErrorState errorCode={guarded.errorCode} />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible();
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);

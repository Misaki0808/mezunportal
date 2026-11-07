// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getVerificationState: vi.fn(),
  getConsentState: vi.fn(),
}));
vi.mock('@/server/permissions', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/server/actions/auth', () => ({ getVerificationState: mocks.getVerificationState }));
vi.mock('@/server/actions/privacy', () => ({ getConsentState: mocks.getConsentState }));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('onay-redirect');
  },
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

import HomePage from './page';

describe('HomePage', () => {
  beforeEach(() => {
    mocks.getConsentState.mockResolvedValue({ ok: true, data: { blocking: false } });
    mocks.requireUser.mockReset();
    mocks.getVerificationState.mockReset();
  });
  it('oturum yokken doğrulama eylemini göstermez', async () => {
    mocks.requireUser.mockRejectedValue(new Error('unauthenticated'));
    renderUi(await HomePage());
    expect(screen.queryByRole('link', { name: /verificationTitle/ })).not.toBeInTheDocument();
    expect(mocks.getVerificationState).not.toHaveBeenCalled();
  });
  it('doğrulanmamış oturuma sunucu durumundan doğrulama bağlantısı gösterir', async () => {
    mocks.requireUser.mockResolvedValue({});
    mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'NOT_STARTED' } });
    renderUi(await HomePage());
    expect(screen.getByRole('link', { name: /verificationTitle/ })).toHaveAttribute(
      'href',
      '/dogrulama',
    );
  });
  it('doğrulanmış üyeye doğrulama uyarısı göstermez', async () => {
    mocks.requireUser.mockResolvedValue({});
    mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'VERIFIED' } });
    renderUi(await HomePage());
    expect(screen.queryByRole('link', { name: /verificationTitle/ })).not.toBeInTheDocument();
  });
});

it('giriş sonrası zorunlu onay eksikse doğrulamadan önce onaya gider', async () => {
  mocks.requireUser.mockResolvedValue({});
  mocks.getConsentState.mockResolvedValue({ ok: true, data: { blocking: true } });
  mocks.getVerificationState.mockClear();
  await expect(HomePage()).rejects.toThrow('onay-redirect');
  expect(mocks.getVerificationState).not.toHaveBeenCalled();
});

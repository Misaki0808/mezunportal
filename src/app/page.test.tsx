// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getVerificationState: vi.fn(),
  getConsentState: vi.fn(),
  getOnboardingState: vi.fn(),
  getHomeSummary: vi.fn(),
  getLandingStats: vi.fn(),
}));
vi.mock('@/server/permissions', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/server/actions/auth', () => ({ getVerificationState: mocks.getVerificationState }));
vi.mock('@/server/actions/privacy', () => ({ getConsentState: mocks.getConsentState }));
vi.mock('@/server/actions/profile', () => ({ getOnboardingState: mocks.getOnboardingState }));
vi.mock('@/server/actions/home', () => ({ getHomeSummary: mocks.getHomeSummary }));
vi.mock('@/server/services/landing', () => ({ getLandingStats: mocks.getLandingStats }));
vi.mock('@/components/landing/landing', () => ({
  Landing: () => (
    <>
      <h1>Karşılama</h1>
      <a href="/giris">signIn</a>
    </>
  ),
}));
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
    mocks.getOnboardingState.mockReset();
    mocks.getOnboardingState.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    mocks.getLandingStats.mockResolvedValue({
      available: true,
      experiences: null,
      mentors: null,
      meetings: null,
    });
    mocks.getHomeSummary.mockReset();
    mocks.getHomeSummary.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
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
  it('inceleme bekleyen belgeyi doğrulamaya başlamamış gibi göstermez', async () => {
    mocks.requireUser.mockResolvedValue({});
    mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'AWAITING_REVIEW' } });
    renderUi(await HomePage());
    expect(screen.getByRole('link', { name: /reviewTitle/ })).toHaveAttribute('href', '/dogrulama');
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

it('doğrulanmış ve ilk girişi yarım kullanıcıya başlangıç bağlantısı gösterir', async () => {
  mocks.requireUser.mockResolvedValue({});
  mocks.getConsentState.mockResolvedValue({ ok: true, data: { blocking: false } });
  mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'VERIFIED' } });
  mocks.getOnboardingState.mockResolvedValue({ ok: true, data: { step: 'INTERESTS' } });
  renderUi(await HomePage());
  expect(screen.getByRole('link', { name: /onboardingTitle/ })).toHaveAttribute(
    'href',
    '/baslangic',
  );
});

const summary = (over: object = {}) => ({
  ok: true,
  data: {
    firstName: 'Deniz',
    role: 'STUDENT',
    pending: {
      contactRequests: 2,
      cvReviewsToAnswer: 0,
      cvReviewsToRate: 0,
      feedbackForms: 1,
      appointmentRequests: 0,
    },
    adminPending: null,
    ...over,
  },
});

describe('HomePage: kişisel pano', () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({});
    mocks.getConsentState.mockResolvedValue({ ok: true, data: { blocking: false } });
    mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'VERIFIED' } });
    mocks.getOnboardingState.mockResolvedValue({ ok: true, data: { step: 'COMPLETE' } });
  });
  it('doğrulanmış kullanıcıda sunucudan gelen sayılarla pano çizilir; "Çok yakında" yoktur', async () => {
    mocks.getHomeSummary.mockResolvedValue(summary());
    renderUi(await HomePage());
    expect(screen.getByRole('heading', { level: 1, name: 'Merhaba, Deniz' })).toBeVisible();
    expect(screen.getByRole('link', { name: /2 iletişim talebi/ })).toHaveAttribute(
      'href',
      '/hesap/iletisim',
    );
    expect(screen.getByRole('link', { name: /1 görüşme formu/ })).toHaveAttribute(
      'href',
      '/hesap/gorusmeler',
    );
    expect(document.body.textContent).not.toMatch(/Çok yakında/);
  });
  it('oturum yokken ve doğrulanmamışken pano sayıları istenmez; giriş yap ya da doğrulama gösterilir', async () => {
    mocks.requireUser.mockRejectedValue(new Error('unauthenticated'));
    renderUi(await HomePage());
    expect(mocks.getHomeSummary).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.getByRole('link', { name: 'signIn' })).toHaveAttribute('href', '/giris');
    expect(document.body.textContent).not.toMatch(/Çok yakında/);
  });
  it('pano sayıları alınamazsa (hata) tanıtım başlığına döner ve sayfa kırılmaz', async () => {
    mocks.getHomeSummary.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    renderUi(await HomePage());
    expect(screen.getByRole('heading', { level: 1, name: 'title' })).toBeVisible();
  });
  it('yönetici panosunda Yönetim satırı bekleyen sayıyla görünür', async () => {
    mocks.getHomeSummary.mockResolvedValue(summary({ adminPending: 4 }));
    renderUi(await HomePage());
    expect(screen.getByRole('link', { name: /Yönetim/ })).toHaveAttribute('href', '/yonetim');
    expect(screen.getByText('4 iş inceleme bekliyor')).toBeVisible();
  });
});

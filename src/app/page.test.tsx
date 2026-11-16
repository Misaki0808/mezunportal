// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getVerificationState: vi.fn(),
  getConsentState: vi.fn(),
  getOnboardingState: vi.fn(),
  getHomeSummary: vi.fn(),
  getSuggestedJobs: vi.fn(),
  getLandingStats: vi.fn(),
  getCurrentStory: vi.fn(),
  getMyMentorSettings: vi.fn(),
  listMyAppointments: vi.fn(),
  getSimilarMentors: vi.fn(),
}));
vi.mock('@/server/permissions', () => ({
  requireUser: mocks.requireUser,
  requireUserWithoutConsent: mocks.requireUser,
}));
vi.mock('@/server/actions/auth', () => ({ getVerificationState: mocks.getVerificationState }));
vi.mock('@/server/actions/privacy', () => ({ getConsentState: mocks.getConsentState }));
vi.mock('@/server/actions/profile', () => ({ getOnboardingState: mocks.getOnboardingState }));
vi.mock('@/server/actions/home', () => ({
  getHomeSummary: mocks.getHomeSummary,
  getSuggestedJobs: mocks.getSuggestedJobs,
}));
vi.mock('@/server/actions/alumni-story', () => ({ getCurrentStory: mocks.getCurrentStory }));
vi.mock('@/server/actions/appointment', () => ({
  getMyMentorSettings: mocks.getMyMentorSettings,
  listMyAppointments: mocks.listMyAppointments,
}));
vi.mock('@/server/actions/mentor-directory', () => ({
  getSimilarMentors: mocks.getSimilarMentors,
}));
vi.mock('@/server/services/landing', () => ({ getLandingStats: mocks.getLandingStats }));
vi.mock('@/components/landing/landing', () => ({
  Landing: () => (
    <>
      <h1>Karşılama</h1>
      <a href="/giris">signIn</a>
    </>
  ),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: () => {
    throw new Error('onay-redirect');
  },
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

import HomePage from './page';

const completedOnboarding = {
  step: 'COMPLETE',
  completion: { percent: 100, missing: [] },
  steps: ['MEMBERSHIP', 'INTERESTS', 'GOALS', 'MENTOR_PREFERENCE', 'VISIBILITY'].map((step) => ({
    step,
    status: 'COMPLETED',
    applicable: true,
    skippable: step !== 'MEMBERSHIP',
  })),
  interestTagIds: [],
  goalTagIds: [],
  mentorInterested: false,
  studentMentorEligibility: null,
};

beforeEach(() => {
  vi.resetAllMocks();
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
    jobs: null,
    companies: null,
  });
  mocks.getSuggestedJobs.mockResolvedValue({ ok: true, data: [] });
  mocks.getCurrentStory.mockReset().mockResolvedValue({ ok: true, data: null });
  mocks.getHomeSummary.mockReset();
  mocks.getHomeSummary.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });

  mocks.getMyMentorSettings.mockResolvedValue({
    ok: true,
    data: { eligible: false, settings: null, rules: [] },
  });
  mocks.listMyAppointments.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
  mocks.getSimilarMentors.mockResolvedValue({ ok: true, data: { items: [] } });
});

describe('HomePage', () => {
  it('oturumdaki Next kontrol sinyalini girişsiz sayfa olarak yutmaz', async () => {
    const signal = Object.assign(new Error('dynamic'), { digest: 'DYNAMIC_SERVER_USAGE' });
    mocks.requireUser.mockRejectedValue(signal);
    await expect(HomePage()).rejects.toBe(signal);
  });
  it('oturum yokken doğrulama eylemini göstermez', async () => {
    mocks.requireUser.mockRejectedValue(new Error('unauthenticated'));
    renderUi(await HomePage());
    expect(screen.queryByRole('link', { name: /verificationTitle/ })).not.toBeInTheDocument();
    expect(mocks.getVerificationState).not.toHaveBeenCalled();
    expect(mocks.getCurrentStory).not.toHaveBeenCalled();
  });
  it('doğrulanmamış oturuma sunucu durumundan doğrulama bağlantısı gösterir', async () => {
    mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
    mocks.getVerificationState.mockResolvedValue({
      ok: true,
      data: { status: 'NOT_STARTED', emailKind: 'OTHER' },
    });
    renderUi(await HomePage());
    expect(screen.getByRole('heading', { level: 1, name: 'welcome' })).toBeVisible();
    expect(screen.getByRole('link', { name: /verificationTitle/ })).toHaveAttribute(
      'href',
      '/dogrulama',
    );
  });
  it('yeni öğrenci ve akademisyen doğrulama bağlantısı doğrudan üyelik formuna gider (araya durum sayfası girmez)', async () => {
    mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
    for (const emailKind of ['STUDENT_DOMAIN', 'STAFF_DOMAIN']) {
      mocks.getVerificationState.mockResolvedValue({
        ok: true,
        data: { status: 'NOT_STARTED', emailKind },
      });
      const { unmount } = renderUi(await HomePage());
      expect(screen.getByRole('link', { name: /verificationTitle/ })).toHaveAttribute(
        'href',
        '/dogrulama/uyelik',
      );
      expect(screen.getByText('verificationDescription')).toBeVisible();
      unmount();
    }
  });
  it('yeni mezun (kişisel e-posta) için bağlantı durum sayfasına ve açıklama belge yüklemeye gider', async () => {
    mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
    mocks.getVerificationState.mockResolvedValue({
      ok: true,
      data: { status: 'NOT_STARTED', emailKind: 'OTHER' },
    });
    renderUi(await HomePage());
    expect(screen.getByText('verificationDescriptionAlumni')).toBeVisible();
    expect(screen.queryByText('verificationDescription')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /verificationTitle/ })).toHaveAttribute(
      'href',
      '/dogrulama',
    );
  });
  it('inceleme bekleyen mezunun bağlantısı durum sayfasına gider (üyelik formuna değil)', async () => {
    mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
    mocks.getVerificationState.mockResolvedValue({
      ok: true,
      data: { status: 'AWAITING_REVIEW', emailKind: 'STUDENT_DOMAIN' },
    });
    renderUi(await HomePage());
    expect(screen.getByRole('link', { name: /reviewTitle/ })).toHaveAttribute('href', '/dogrulama');
  });
  it('doğrulanmış üyeye doğrulama uyarısı göstermez', async () => {
    mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
    mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'VERIFIED' } });
    renderUi(await HomePage());
    expect(screen.queryByRole('link', { name: /verificationTitle/ })).not.toBeInTheDocument();
  });
  it('inceleme bekleyen belgeyi doğrulamaya başlamamış gibi göstermez', async () => {
    mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
    mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'AWAITING_REVIEW' } });
    renderUi(await HomePage());
    expect(screen.getByRole('link', { name: /reviewTitle/ })).toHaveAttribute('href', '/dogrulama');
    expect(screen.queryByRole('link', { name: /verificationTitle/ })).not.toBeInTheDocument();
  });
});

it('giriş sonrası zorunlu onay eksikse doğrulamadan önce onaya gider', async () => {
  mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
  mocks.getConsentState.mockResolvedValue({ ok: true, data: { blocking: true } });
  mocks.getVerificationState.mockClear();
  await expect(HomePage()).rejects.toThrow('onay-redirect');
  expect(mocks.getVerificationState).not.toHaveBeenCalled();
});

it('doğrulanmış ve ilk girişi yarım kullanıcıya başlangıç bağlantısı gösterir', async () => {
  mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
  mocks.getConsentState.mockResolvedValue({ ok: true, data: { blocking: false } });
  mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'VERIFIED' } });
  mocks.getOnboardingState.mockResolvedValue({
    ok: true,
    data: {
      ...completedOnboarding,
      step: 'INTERESTS',
      completion: { percent: 40, missing: ['INTERESTS', 'GOALS', 'VISIBILITY'] },
    },
  });
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
    mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
    mocks.getConsentState.mockResolvedValue({ ok: true, data: { blocking: false } });
    mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'VERIFIED' } });
    mocks.getOnboardingState.mockResolvedValue({ ok: true, data: completedOnboarding });
  });
  it('doğrulanmış kullanıcıda sunucudan gelen sayılarla pano çizilir; "Çok yakında" yoktur', async () => {
    mocks.getHomeSummary.mockResolvedValue(summary());
    renderUi(await HomePage());
    expect(screen.getByRole('heading', { level: 1, name: /Deniz$/ })).toBeVisible();
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
  it('başlangıç bitmediyse devam bağlantısı Profil kartının eylemidir; panoda ayrı bant çizilmez', async () => {
    mocks.getHomeSummary.mockResolvedValue(summary());
    mocks.getOnboardingState.mockResolvedValue({
      ok: true,
      data: {
        ...completedOnboarding,
        step: 'INTERESTS',
        completion: { percent: 40, missing: ['INTERESTS', 'GOALS', 'VISIBILITY'] },
      },
    });
    renderUi(await HomePage());
    const profile = within(screen.getByRole('region', { name: 'Profilin' }));
    expect(profile.getByRole('link', { name: 'Başlangıca devam et' })).toHaveAttribute(
      'href',
      '/baslangic',
    );
    expect(screen.getAllByRole('link', { name: 'Başlangıca devam et' })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /onboardingTitle/ })).toBeNull();
  });
  it('başlangıç tamamsa Profil kartı Profilini düzenle der', async () => {
    mocks.getHomeSummary.mockResolvedValue(summary());
    renderUi(await HomePage());
    const profile = within(screen.getByRole('region', { name: 'Profilin' }));
    expect(profile.getByRole('link', { name: 'Profilini düzenle' })).toHaveAttribute(
      'href',
      '/profil',
    );
    expect(screen.queryByRole('link', { name: 'Başlangıca devam et' })).toBeNull();
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

it('rıza kapısı açık değilken yeni pano servisleri çağrılmaz', async () => {
  mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
  mocks.getConsentState.mockResolvedValue({ ok: true, data: { blocking: true } });
  await expect(HomePage()).rejects.toThrow('onay-redirect');
  expect(mocks.listMyAppointments).not.toHaveBeenCalled();
  expect(mocks.getSimilarMentors).not.toHaveBeenCalled();
  expect(mocks.getSuggestedJobs).not.toHaveBeenCalled();
});

it('öğrenci panosu tek toplu randevu ve mentor çağrısıyla gerçek boş durumları verir', async () => {
  mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
  mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'VERIFIED' } });
  mocks.getOnboardingState.mockResolvedValue({ ok: true, data: completedOnboarding });
  mocks.getHomeSummary.mockResolvedValue(summary());
  renderUi(await HomePage());
  expect(mocks.listMyAppointments).toHaveBeenCalledExactlyOnceWith({
    role: 'MENTEE',
    statuses: ['CONFIRMED'],
    limit: 2,
  });
  expect(mocks.getSimilarMentors).toHaveBeenCalledOnce();
  expect(mocks.getSuggestedJobs).toHaveBeenCalledOnce();
  expect(screen.getByText('Henüz planlanmış görüşmen yok.')).toBeVisible();
});

it('mentor panosu ilan/mentor önerisi istemez, randevu rolü sunucu uygunluğundan gelir', async () => {
  mocks.requireUser.mockResolvedValue({ facts: { memberships: [] } });
  mocks.getVerificationState.mockResolvedValue({ ok: true, data: { status: 'VERIFIED' } });
  mocks.getOnboardingState.mockResolvedValue({ ok: true, data: completedOnboarding });
  mocks.getHomeSummary.mockResolvedValue(summary({ role: 'MENTOR' }));
  mocks.getMyMentorSettings.mockResolvedValue({
    ok: true,
    data: { eligible: true, settings: { monthlyCapacity: 6, isActive: true }, rules: [] },
  });
  renderUi(await HomePage());
  expect(mocks.getSimilarMentors).not.toHaveBeenCalled();
  expect(mocks.getSuggestedJobs).not.toHaveBeenCalled();
  expect(mocks.listMyAppointments).toHaveBeenCalledExactlyOnceWith({
    role: 'MENTOR',
    statuses: ['CONFIRMED'],
    limit: 2,
  });
  expect(screen.getByRole('region', { name: 'Bu ayki kapasiten' })).toBeVisible();
});

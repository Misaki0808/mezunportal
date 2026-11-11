// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { HomeSummary } from '@/contracts/home';
import { renderUi } from '@/test/render';

import { HomeDashboard } from './dashboard';

const base: HomeSummary = {
  firstName: 'Mert',
  role: 'STUDENT',
  pending: {
    contactRequests: 0,
    cvReviewsToAnswer: 0,
    cvReviewsToRate: 0,
    feedbackForms: 0,
    appointmentRequests: 0,
  },
  adminPending: null,
};
const hrefs = () =>
  within(screen.getByRole('region', { name: 'Kısayollar' }))
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'));

describe('ana sayfa panosu', () => {
  it('karşılar; bekleyen iş yoksa bunu söyler ve bekleyen satırı çizmez', () => {
    renderUi(<HomeDashboard summary={base} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Merhaba, Mert' })).toBeVisible();
    expect(screen.getByText('Şu an bekleyen bir işin yok.')).toBeVisible();
    const region = screen.getByRole('region', { name: 'Bekleyen işlerin' });
    expect(within(region).getByRole('link', { name: 'Deneyimleri keşfet' })).toHaveAttribute(
      'href',
      '/deneyimler',
    );
  });

  it('ad boşsa yalnız "Merhaba" der', () => {
    renderUi(<HomeDashboard summary={{ ...base, firstName: '' }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Merhaba' })).toBeVisible();
  });

  it('yalnız sıfırdan büyük bekleyen işler listelenir ve doğru sayfaya gider', () => {
    renderUi(
      <HomeDashboard
        summary={{
          ...base,
          role: 'MENTOR',
          pending: {
            contactRequests: 1,
            cvReviewsToAnswer: 3,
            cvReviewsToRate: 0,
            feedbackForms: 2,
            appointmentRequests: 0,
          },
        }}
      />,
    );
    const region = screen.getByRole('region', { name: 'Bekleyen işlerin' });
    const links = within(region).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      '1 iletişim talebi yanıtını bekliyor→',
      '3 CV inceleme talebi yanıtını bekliyor→',
      '2 görüşme formu seni bekliyor→',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/hesap/iletisim',
      '/hesap/cv-inceleme',
      '/hesap/gorusmeler',
    ]);
    expect(screen.queryByText('Şu an bekleyen bir işin yok.')).not.toBeInTheDocument();
  });

  it('değerlendirme bekleyen CV incelemesi öğrenciye gösterilir', () => {
    renderUi(
      <HomeDashboard summary={{ ...base, pending: { ...base.pending, cvReviewsToRate: 1 } }} />,
    );
    expect(screen.getByText('1 CV incelemesi değerlendirmeni bekliyor')).toBeVisible();
  });

  it('kısayollar rol bazlıdır (öğrenci: mentor bul + CV incelemesi; mentor: gelen CV talepleri + profil)', () => {
    const { unmount } = renderUi(<HomeDashboard summary={base} />);
    expect(hrefs()).toEqual(['/deneyimler', '/mentorlar', '/hesap/cv-inceleme', '/deneyim/yeni']);
    expect(screen.getByRole('link', { name: /Mentor bul/ })).toBeVisible();
    unmount();
    renderUi(<HomeDashboard summary={{ ...base, role: 'MENTOR' }} />);
    expect(hrefs()).toEqual(['/deneyimler', '/hesap/cv-inceleme', '/deneyim/yeni', '/profil']);
    expect(screen.queryByRole('link', { name: /Mentor bul/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CV incelemeleri/ })).toBeVisible();
  });

  it("SSS ve randevu kısayolu henüz yok (main'de ekranı yok)", () => {
    renderUi(<HomeDashboard summary={base} />);
    expect(document.body.textContent).not.toMatch(/SSS|Randevu/);
  });

  it('Yönetim satırı yalnız yöneticide; sayı yoksa "Bekleyen iş yok" der', () => {
    const { unmount } = renderUi(<HomeDashboard summary={base} />);
    expect(screen.queryByRole('link', { name: /Yönetim/ })).not.toBeInTheDocument();
    unmount();
    renderUi(<HomeDashboard summary={{ ...base, adminPending: 0 }} />);
    expect(screen.getByRole('link', { name: /Yönetim/ })).toHaveAttribute('href', '/yonetim');
    expect(screen.getByText('Bekleyen iş yok')).toBeVisible();
  });
});

it('bekleyen iş yoksa mentor için tek anlamlı başlangıç eylemi gösterir', () => {
  renderUi(<HomeDashboard summary={{ ...base, role: 'MENTOR' }} />);
  const region = screen.getByRole('region', { name: 'Bekleyen işlerin' });
  expect(within(region).getAllByRole('link')).toHaveLength(1);
  expect(within(region).getByRole('link', { name: 'Deneyimini paylaş' })).toHaveAttribute(
    'href',
    '/deneyim/yeni',
  );
});

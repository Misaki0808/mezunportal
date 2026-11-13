// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import Link from 'next/link';
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
    // Boşken yer kaplamaz: bağlantı yok, eylemler hemen altındaki kısayollardır.
    const region = screen.getByRole('region', { name: 'Bekleyen işlerin' });
    expect(within(region).queryByRole('link')).toBeNull();
  });

  it('karşılamanın altında rolüne göre sıcak tek cümle; bekleyen iş varsa sayıyı söyler', () => {
    const { unmount } = renderUi(<HomeDashboard summary={base} />);
    expect(screen.getByText('Staj yolculuğunda bugün ne yapmak istersin?')).toBeVisible();
    unmount();
    const { unmount: second } = renderUi(<HomeDashboard summary={{ ...base, role: 'MENTOR' }} />);
    expect(screen.getByText('Öğrencilere bugün nasıl destek olmak istersin?')).toBeVisible();
    second();
    renderUi(
      <HomeDashboard
        summary={{ ...base, pending: { ...base.pending, contactRequests: 2, feedbackForms: 1 } }}
      />,
    );
    expect(screen.getByText('Seni bekleyen 3 iş var.')).toBeVisible();
    expect(screen.queryByText('Staj yolculuğunda bugün ne yapmak istersin?')).toBeNull();
  });

  it('sıradaki adım kutusu karşılamanın ÖNÜNE geçmez (önce selam, sonra kutu)', () => {
    renderUi(
      <HomeDashboard summary={base} notice={<Link href="/baslangic">Başlangıca devam et</Link>} />,
    );
    const heading = screen.getByRole('heading', { level: 1, name: 'Merhaba, Mert' });
    const notice = screen.getByRole('link', { name: 'Başlangıca devam et' });
    expect(heading.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('kod sırası telefon sırasıyla aynı (selam, kutu, hikâye, bekleyenler, kısayollar, yönetim, ilanlar); masaüstünde iki sütuna bölünür', () => {
    const { container } = renderUi(
      <HomeDashboard
        summary={{ ...base, adminPending: 2, pending: { ...base.pending, contactRequests: 1 } }}
        notice={<Link href="/baslangic">Başlangıca devam et</Link>}
        feature={<Link href="/hikayeler">Hikâye arşivi</Link>}
        aside={<p>Sana uyan ilanlar burada</p>}
      />,
    );
    const order = [
      screen.getByRole('heading', { level: 1 }),
      screen.getByRole('link', { name: 'Başlangıca devam et' }),
      screen.getByRole('link', { name: 'Hikâye arşivi' }),
      screen.getByRole('region', { name: 'Bekleyen işlerin' }),
      screen.getByRole('region', { name: 'Kısayollar' }),
      screen.getByRole('link', { name: /Yönetim/ }),
      screen.getByText('Sana uyan ilanlar burada'),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    // Sol sütun: selam → bekleyenler; sağ sütun: kısayollar → yönetim → ilanlar (≥1024 px'te yan yana).
    const [left, right] = Array.from(container.firstElementChild!.children);
    expect(left).toContainElement(order[3]!);
    expect(left).not.toContainElement(order[4]!);
    expect(right).toContainElement(order[4]!);
    expect(right).toContainElement(order[6]!);
    expect(container.firstElementChild).toHaveClass('lg:grid-cols-2');
  });

  it('mentorda da sağ sütun doludur (kısayollar sağda); ilan paneli yoksa yalnız aside boş kalır', () => {
    const { container } = renderUi(<HomeDashboard summary={{ ...base, role: 'MENTOR' }} />);
    const right = container.firstElementChild!.children[1]!;
    expect(right).toContainElement(screen.getByRole('region', { name: 'Kısayollar' }));
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

it('bekleyen iş yoksa mentor için eylem yine kısayollardadır (deneyim paylaş, profil)', () => {
  renderUi(<HomeDashboard summary={{ ...base, role: 'MENTOR' }} />);
  const shortcuts = within(screen.getByRole('region', { name: 'Kısayollar' }));
  expect(shortcuts.getByRole('link', { name: /Deneyim yaz/ })).toHaveAttribute(
    'href',
    '/deneyim/yeni',
  );
  expect(shortcuts.getByRole('link', { name: /Profil/ })).toHaveAttribute('href', '/profil');
});

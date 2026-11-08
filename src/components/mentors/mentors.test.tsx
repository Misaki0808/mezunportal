// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MentorCard as MentorCardData, MentorPage } from '@/contracts/mentor-directory';
import { renderUi } from '@/test/render';

import { MentorCard } from './mentor-card';
import { MentorDirectory } from './mentor-directory';
import { MentorEntryPoints } from './mentor-entry-points';
import { SimilarMentors } from './similar-mentors';

const router = vi.hoisted(() => ({ push: vi.fn(), pending: false }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useTransition: () => [router.pending, (run: () => void) => run()],
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  router.push.mockReset();
  router.pending = false;
});

const mentor = (over: Partial<MentorCardData> = {}): MentorCardData => ({
  userId: 'm1',
  displayName: 'Mert Yıldız',
  headline: 'Ürün yöneticisi',
  mentorType: 'ALUMNI',
  departmentName: 'Yönetim Bilişim Sistemleri',
  graduationYear: 2022,
  position: { company: 'Örnek A.Ş.', title: 'Ürün Yöneticisi' },
  sectorName: 'Yazılım',
  topics: ['software', 'bilinmeyen-anahtar'],
  skills: ['SQL', 'Figma'],
  availability: { available: true, reason: null, pausedUntil: null },
  capacity: { monthly: 6, used: 2, remaining: 4 },
  sessionMinutes: 20,
  meetingModes: ['ONLINE', 'IN_PERSON'],
  cvReviewEnabled: true,
  ...over,
});
const page = (items: MentorCardData[], total = items.length): MentorPage => ({
  items,
  page: 1,
  pageSize: 12,
  total,
  hasMore: false,
});
const sectors = [{ id: 's1', name: 'Yazılım' }];

describe('mentor kartı', () => {
  it('dizinden açılan "İletişim iste" kaynağa dönüş yolunu taşır; güvensiz yol eklenmez', () => {
    const { unmount } = renderUi(
      <MentorCard mentor={mentor()} returnTo="/mentorlar?mentorTypes=ALUMNI&page=2" />,
    );
    expect(screen.getByRole('link', { name: 'İletişim iste' })).toHaveAttribute(
      'href',
      '/iletisim-iste/m1?donus=%2Fmentorlar%3FmentorTypes%3DALUMNI%26page%3D2',
    );
    unmount();
    renderUi(<MentorCard mentor={mentor()} returnTo="https://kotu.example/x" />);
    expect(screen.getByRole('link', { name: 'İletişim iste' })).toHaveAttribute(
      'href',
      '/iletisim-iste/m1',
    );
  });

  it('başlık, şirket/unvan, konular, müsaitlik ve kapasite; e-posta/telefon yok', () => {
    renderUi(<MentorCard mentor={mentor()} />);
    expect(screen.getByRole('heading', { name: 'Mert Yıldız' })).toBeInTheDocument();
    expect(screen.getByText('Ürün Yöneticisi · Örnek A.Ş.')).toBeInTheDocument();
    expect(screen.getByText('Müsait')).toBeInTheDocument();
    expect(screen.getByText('Bu ay 4/6 görüşme hakkı kaldı')).toBeInTheDocument();
    expect(screen.getByText('Yazılım geliştirme')).toBeInTheDocument();
    // Kataloğda olmayan konu anahtarı ham metin olarak sızmaz.
    expect(screen.queryByText('bilinmeyen-anahtar')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profili gör' })).toHaveAttribute('href', '/uye/m1');
    expect(screen.getByRole('link', { name: 'İletişim iste' })).toHaveAttribute(
      'href',
      '/iletisim-iste/m1',
    );
    expect(document.body.textContent).not.toMatch(/@|\+90/);
  });

  it('ara verdi ve dolu durumları metinle (renk tek sinyal değil) gösterilir', () => {
    const { rerender } = renderUi(
      <MentorCard
        mentor={mentor({
          availability: {
            available: false,
            reason: 'PAUSED',
            pausedUntil: new Date('2026-12-01T00:00:00Z'),
          },
        })}
      />,
    );
    expect(screen.getByText(/Ara verdi · 1 Aralık 2026 tarihine kadar/)).toBeInTheDocument();
    rerender(
      <MentorCard
        mentor={mentor({
          availability: { available: false, reason: 'CAPACITY_FULL', pausedUntil: null },
        })}
      />,
    );
    expect(screen.getByText('Bu ay dolu')).toBeInTheDocument();
  });
});

describe('benzer yol izleyenler', () => {
  it('her mentor gerekçe etiketleriyle görünür; ilgi anahtarı katalog adına çevrilir', () => {
    renderUi(
      <SimilarMentors
        data={{
          items: [
            {
              mentor: mentor(),
              reasons: [
                { code: 'SAME_SECTOR', values: ['Yazılım'] },
                { code: 'SHARED_INTEREST', values: ['software'] },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Sana benzer yol izleyenler' })).toBeInTheDocument();
    expect(screen.getByText('Aynı sektör: Yazılım')).toBeInTheDocument();
    expect(screen.getByText('Ortak ilgi: Yazılım geliştirme')).toBeInTheDocument();
  });

  it('öneri yoksa bölüm hiç çizilmez', () => {
    renderUi(<SimilarMentors data={{ items: [] }} />);
    expect(screen.queryByText('Sana benzer yol izleyenler')).not.toBeInTheDocument();
  });
});

describe('giriş noktaları', () => {
  const open = { available: true, reason: null };
  it('açık iletişim bağlantı olur; kapalı randevu ve CV incelemesi sebebiyle açıklanır, “yakında” yazmaz', () => {
    renderUi(
      <MentorEntryPoints
        userId="m1"
        entry={{
          contact: open,
          appointment: { available: false, reason: 'CAPACITY_FULL' },
          cvReview: { available: false, reason: 'CV_REVIEW_DISABLED' },
        }}
      />,
    );
    expect(screen.getByRole('link', { name: 'İletişim iste' })).toHaveAttribute(
      'href',
      '/iletisim-iste/m1?donus=%2Fuye%2Fm1',
    );
    expect(screen.getByText('Mentorun bu ayki kapasitesi dolu.')).toBeInTheDocument();
    expect(screen.getByText('Bu mentor CV incelemesi yapmıyor.')).toBeInTheDocument();
    expect(screen.queryByText(/yakında/i)).not.toBeInTheDocument();
  });

  it('açık bayrak için (eylem kartı gelene kadar) düğme çizilmez', () => {
    renderUi(
      <MentorEntryPoints
        userId="m1"
        entry={{ contact: open, appointment: open, cvReview: open }}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Randevu/)).not.toBeInTheDocument();
  });

  it('mentor değil ya da kendi profili: bölüm hiç çizilmez', () => {
    const blocked = (reason: 'NOT_MENTOR' | 'SELF') => ({
      contact: { available: false, reason },
      appointment: { available: false, reason },
      cvReview: { available: false, reason },
    });
    const { rerender } = renderUi(<MentorEntryPoints userId="m1" entry={blocked('NOT_MENTOR')} />);
    expect(screen.queryByText('Mentorla bağlantı')).not.toBeInTheDocument();
    rerender(<MentorEntryPoints userId="m1" entry={blocked('SELF')} />);
    expect(screen.queryByText('Mentorla bağlantı')).not.toBeInTheDocument();
  });
});

describe('mentor dizini', () => {
  const dialogFilters = () => within(screen.getByRole('dialog'));

  it('sonuç sayısı, kartlar ve etkin filtre çipleri; çip kaldırınca URL güncellenir', async () => {
    const { user } = renderUi(
      <MentorDirectory
        filter={{ onlyAvailable: true, mentorTypes: ['ALUMNI'], sectorId: 's1' }}
        results={page([mentor()], 1)}
        sectors={sectors}
        similar={null}
      />,
    );
    expect(screen.getByText('1 sonuç')).toBeInTheDocument();
    const chips = screen.getByLabelText('Etkin filtreler');
    expect(within(chips).getByText('Yalnız müsait olanlar')).toBeInTheDocument();
    expect(within(chips).getByText('Mezun')).toBeInTheDocument();
    expect(within(chips).getByText('Yazılım')).toBeInTheDocument();
    await user.click(within(chips).getByRole('button', { name: /Yalnız müsait olanlar/ }));
    expect(router.push).toHaveBeenCalledWith('/mentorlar?sectorId=s1&mentorTypes=ALUMNI');
  });

  it('mobil alt sayfada seçilen filtreler Uygula ile kanonik URL’ye yazılır; Vazgeç taslağı geri alır', async () => {
    const { user } = renderUi(
      <MentorDirectory filter={{}} results={page([mentor()])} sectors={sectors} similar={null} />,
    );
    await user.click(screen.getByRole('button', { name: 'Filtreler' }));
    const sheet = dialogFilters();
    await user.click(sheet.getByRole('switch', { name: /Yalnız müsait olanlar/ }));
    await user.click(sheet.getByRole('checkbox', { name: 'Çevrimiçi' }));
    await user.click(sheet.getByRole('checkbox', { name: 'Staj' }));
    await user.type(sheet.getByLabelText('Şirket'), 'Örnek');
    await user.click(sheet.getByRole('button', { name: 'Uygula' }));
    expect(router.push).toHaveBeenCalledWith(
      '/mentorlar?company=%C3%96rnek&experienceTypes=INTERNSHIP&meetingModes=ONLINE&onlyAvailable=1',
    );
  });

  it('2 karakterden kısa şirket adı sunucuya gitmez, alan hatası verir', async () => {
    const { user } = renderUi(
      <MentorDirectory filter={{}} results={page([mentor()])} sectors={sectors} similar={null} />,
    );
    await user.click(screen.getByRole('button', { name: 'Filtreler' }));
    const sheet = dialogFilters();
    await user.type(sheet.getByLabelText('Şirket'), 'a');
    await user.click(sheet.getByRole('button', { name: 'Uygula' }));
    expect(router.push).not.toHaveBeenCalled();
    // Alt sayfa açık kalır ve hata alanın altında görünür.
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    expect(sheet.getByText('En az 2 karakter yaz.')).toBeInTheDocument();
  });

  it('sonuç yoksa yönlendirici boş durum: filtre varken temizle, filtre yokken bilgi', async () => {
    const { user, rerender } = renderUi(
      <MentorDirectory
        filter={{ onlyAvailable: true }}
        results={page([])}
        sectors={sectors}
        similar={null}
      />,
    );
    expect(screen.getByText('Bu filtrelerle mentor bulunamadı')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Filtreleri temizle' })[0]!);
    expect(router.push).toHaveBeenCalledWith('/mentorlar');
    rerender(<MentorDirectory filter={{}} results={page([])} sectors={sectors} similar={null} />);
    expect(screen.getByText('Henüz listelenecek mentor yok')).toBeInTheDocument();
  });

  it('benzer mentorlar bölümü sonuçların üstünde, gerekçeleriyle çizilir', () => {
    renderUi(
      <MentorDirectory
        filter={{}}
        results={page([mentor({ userId: 'm2', displayName: 'Ayşe Demir' })])}
        sectors={sectors}
        similar={{
          items: [
            {
              mentor: mentor(),
              reasons: [{ code: 'SAME_DEPARTMENT', values: ['Yönetim Bilişim Sistemleri'] }],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Aynı bölüm: Yönetim Bilişim Sistemleri')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ayşe Demir' })).toBeInTheDocument();
  });
});

it('inceleyici: bekleyen gezinmede Uygula, çip kaldırma ve temizle ikinci gönderim yapmaz', async () => {
  router.pending = true;
  const { user } = renderUi(
    <MentorDirectory
      filter={{ company: 'Örnek' }}
      results={page([mentor()])}
      sectors={sectors}
      similar={null}
    />,
  );
  expect(screen.getByRole('button', { name: /^Uygula/ })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Örnek etiketini kaldır' }));
  await user.click(screen.getByRole('button', { name: 'Filtreleri temizle' }));
  expect(router.push).not.toHaveBeenCalled();
});

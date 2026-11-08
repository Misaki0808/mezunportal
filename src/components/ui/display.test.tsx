// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

const path = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => path.current }));

import { Avatar, initialsOf } from './avatar';
import { ErrorState } from './error-state';
import { Pagination } from './pagination';
import { Stepper } from './stepper';
import { Tag } from './tag';

describe('Pagination', () => {
  it('ilk sayfada “önceki” etkisizdir ve sebebi ekran okuyucuya söylenir', () => {
    renderUi(<Pagination page={1} pageCount={5} onPageChange={() => undefined} />);

    const previous = screen.getByRole('button', { name: /Önceki/ });
    expect(previous).toHaveAttribute('aria-disabled', 'true');
    expect(previous).toHaveAccessibleName(/ilk sayfadasın/);
    expect(screen.getByText('Sayfa 1 / 5')).toBeInTheDocument();
  });

  it('sonraki sayfaya geçer; etkisiz düğme çağrı yapmaz', async () => {
    const onPageChange = vi.fn();
    const { user } = renderUi(<Pagination page={5} pageCount={5} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: /Sonraki/ }));
    expect(onPageChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Önceki/ }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('bağlantı modunda gerçek bağlantı üretir', () => {
    renderUi(<Pagination page={2} pageCount={5} hrefFor={(p) => `/liste?sayfa=${p}`} />);

    expect(screen.getByRole('link', { name: /Sonraki/ })).toHaveAttribute('href', '/liste?sayfa=3');
    expect(screen.getByRole('link', { name: /Önceki/ })).toHaveAttribute('href', '/liste?sayfa=1');
  });

  it('tek sayfada hiçbir şey çizmez', () => {
    const { container } = renderUi(<Pagination page={1} pageCount={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Stepper', () => {
  const steps = [
    { id: 'a', label: 'Bilgiler' },
    { id: 'b', label: 'Doğrulama' },
    { id: 'c', label: 'Onay' },
  ];

  it('şu anki adım aria-current="step"; tamamlananlar metinle bildirilir', () => {
    renderUi(<Stepper steps={steps} current={1} />);

    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[0]).toHaveTextContent('tamamlandı');
    expect(items[1]).toHaveTextContent('şu anki adım');
  });

  it('mobil özet “Adım 2 / 3: Doğrulama” der', () => {
    renderUi(<Stepper steps={steps} current={1} />);
    expect(screen.getByText('Adım 2 / 3: Doğrulama')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('kararlı hata kodunu katalogdaki metne çevirir, kodu ham basmaz', () => {
    renderUi(<ErrorState errorCode="RATE_LIMITED" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Çok fazla deneme yaptın. Biraz bekleyip tekrar dene.',
    );
    expect(screen.queryByText('RATE_LIMITED')).not.toBeInTheDocument();
  });

  it('tekrar dene düğmesi yalnız onRetry verilince vardır', async () => {
    const onRetry = vi.fn();
    const { user } = renderUi(<ErrorState errorCode="SERVER_UNEXPECTED" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('beklenen durum alarm değildir: h1 durum başlığı + tek eylem, kırmızı uyarı yok', () => {
    path.current = '/hesap/gorusme/x';
    renderUi(<ErrorState errorCode="FEEDBACK_NOT_READY" />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Form henüz açılmadı' })).toBeVisible();
    expect(screen.queryByText('Bir sorun oluştu')).not.toBeInTheDocument();
    expect(screen.getByText('Form, görüşme bittikten bir saat sonra açılır.')).toBeVisible();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Görüşmelerime dön');
    expect(links[0]).toHaveAttribute('href', '/hesap/gorusmeler');
  });

  it.each([
    ['AUTH_FORBIDDEN', 'Bu sayfa senin rolün için değil', 'Ana sayfaya dön', '/'],
    ['AUTH_UNAUTHENTICATED', 'Giriş yapman gerekiyor', 'Giriş yap', '/giris'],
    ['AUTH_NOT_VERIFIED', 'Üyeliğini doğrulaman gerekiyor', 'Doğrulamaya git', '/dogrulama'],
    ['CONSENT_REQUIRED', 'Önce metinleri onaylaman gerekiyor', 'Onay ekranına git', '/onay'],
    ['RESOURCE_NOT_FOUND', 'Aradığın sayfa bulunamadı', 'Ana sayfaya dön', '/'],
  ] as const)('%s → durum başlığı ve eylem', (code, title, label, href) => {
    path.current = '/';
    renderUi(<ErrorState errorCode={code} />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible();
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  });

  it('giriş gerektiren durumda "Giriş yap" bulunulan sayfayı ?donus ile taşır (güvensiz/ana sayfada düz)', () => {
    path.current = '/hesap/cv-inceleme';
    const { unmount } = renderUi(<ErrorState errorCode="AUTH_UNAUTHENTICATED" />);
    expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute(
      'href',
      '/giris?donus=%2Fhesap%2Fcv-inceleme',
    );
    unmount();
    path.current = '/';
    renderUi(<ErrorState errorCode="AUTH_UNAUTHENTICATED" />);
    expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/giris');
  });

  it('yönetim alt sayfasında rol dışı durum panele döndürür; açık eylem öncelik alır', () => {
    path.current = '/yonetim/sozlukler';
    const { unmount } = renderUi(<ErrorState errorCode="AUTH_FORBIDDEN" />);
    expect(screen.getByRole('link', { name: 'Yönetim paneline dön' })).toHaveAttribute(
      'href',
      '/yonetim',
    );
    unmount();
    renderUi(
      <ErrorState errorCode="AUTH_FORBIDDEN" action={{ href: '/hesap', label: 'Hesabıma dön' }} />,
    );
    expect(screen.getByRole('link', { name: 'Hesabıma dön' })).toHaveAttribute('href', '/hesap');
  });

  it('gerçek hata ve onRetry verilen kullanım alarm olarak kalır', () => {
    path.current = '/';
    renderUi(<ErrorState errorCode="SERVER_UNEXPECTED" />);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Bir sorun oluştu' })).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    renderUi(<ErrorState errorCode="AUTH_FORBIDDEN" onRetry={() => undefined} />);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('onRetry yoksa düğme yoktur', () => {
    renderUi(<ErrorState errorCode="SERVER_UNEXPECTED" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Avatar', () => {
  it('baş harfleri tr-TR kuralıyla büyütür (i → İ, ı → I)', () => {
    expect(initialsOf('istanbul üni')).toBe('İÜ');
    expect(initialsOf('ışıl çelik')).toBe('IÇ');
    expect(initialsOf('  ayşe  ')).toBe('A');
  });

  it('görsel yokken adı erişilebilir ad olarak taşır', () => {
    renderUi(<Avatar name="Ayşe Yılmaz" />);
    expect(screen.getByRole('img', { name: 'Ayşe Yılmaz' })).toBeInTheDocument();
  });

  it('görselde alt metin addır; süs olarak işaretlenirse boştur', () => {
    const { rerender } = renderUi(<Avatar name="Ayşe Yılmaz" src="/a.png" />);
    expect(screen.getByRole('img', { name: 'Ayşe Yılmaz' })).toBeInTheDocument();

    rerender(<Avatar name="Ayşe Yılmaz" src="/a.png" decorative />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('Tag', () => {
  it('kaldırma düğmesi etiketi adıyla söyler', async () => {
    const onRemove = vi.fn();
    const { user } = renderUi(<Tag label="Veri analizi" onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Veri analizi etiketini kaldır' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

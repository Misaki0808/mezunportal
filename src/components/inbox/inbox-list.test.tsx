// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { markInboxReadInputSchema, type InboxGroupView, type InboxPage } from '@/contracts/inbox';
import { ToastProvider } from '@/components/ui';
import { renderUi } from '@/test/render';

import messages from '../../../messages/tr.json';

const mocks = vi.hoisted(() => ({ list: vi.fn(), mark: vi.fn(), markAll: vi.fn() }));
vi.mock('@/server/actions/inbox', () => ({
  getMyInbox: mocks.list,
  markInboxRead: mocks.mark,
  markAllInboxRead: mocks.markAll,
}));
// Gerçek gezinmeyi başlatmadan tıklamayı gözlemler.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

import { INBOX_CHANGED_EVENT } from './notification-bell';
import { InboxList } from './inbox-list';

const TODAY = '2030-06-20';
const SERVER_ERROR = messages.errors.codes.SERVER_UNEXPECTED;
let seq = 0;
const group = (overrides: Partial<InboxGroupView> = {}): InboxGroupView => {
  const n = ++seq;
  return {
    key: `${TODAY}:jobMatchPosting:${n}`,
    kind: 'jobMatchPosting',
    category: 'job',
    day: TODAY,
    count: 1,
    unread: 1,
    ids: [`id-${n}`],
    latestAt: new Date('2030-06-20T11:20:00Z'),
    href: '/ilanlar/p1',
    ...overrides,
  };
};
const page = (groups: InboxGroupView[], extra: Partial<InboxPage> = {}): InboxPage => ({
  groups,
  nextCursor: null,
  unread: groups.reduce((sum, item) => sum + item.unread, 0),
  ...extra,
});
const show = (initial: InboxPage) =>
  renderUi(
    <ToastProvider>
      <InboxList initial={initial} today={TODAY} />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.mark.mockResolvedValue({ ok: true, data: { marked: 1 } });
  mocks.markAll.mockResolvedValue({ ok: true, data: { marked: 3 } });
});

describe('InboxList: gruplama ve gün başlıkları', () => {
  it('aynı gündeki 3 ilan tek satırda "3 yeni ilan" olur; tek ilan tekil metin ve kendi bağlantısıdır', () => {
    show(
      page([
        group({ count: 3, href: '/ilanlar', ids: ['a', 'b', 'c'], unread: 3 }),
        group({ kind: 'contact', category: 'contact', href: '/hesap/iletisim' }),
      ]),
    );
    const many = screen.getByRole('link', { name: /Profiline uyan 3 yeni ilan var\./ });
    expect(many).toHaveAttribute('href', '/ilanlar');
    const single = screen.getByRole('link', { name: /Sana bir iletişim talebi geldi\./ });
    expect(single).toHaveAttribute('href', '/hesap/iletisim');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('günler "Bugün", "Dün" ve tarih başlığıyla ayrılır; satırlar kendi gününün altındadır', () => {
    show(
      page([
        group(),
        group({
          day: '2030-06-19',
          kind: 'contact',
          category: 'contact',
          latestAt: new Date('2030-06-19T09:00:00Z'),
        }),
        group({
          day: '2030-06-12',
          kind: 'faqPublished',
          category: 'faq',
          latestAt: new Date('2030-06-12T09:00:00Z'),
        }),
      ]),
    );
    const today = screen.getByRole('region', { name: 'Bugün' });
    expect(within(today).getByText(/Profiline uyan yeni bir ilan var/)).toBeVisible();
    const yesterday = screen.getByRole('region', { name: 'Dün' });
    expect(within(yesterday).getByText(/iletişim talebi/)).toBeVisible();
    const older = screen.getByRole('region', { name: '12 Haziran Çarşamba' });
    expect(within(older).getByText(/Sorun yayınlandı/)).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Bugün',
      'Dün',
      '12 Haziran Çarşamba',
    ]);
  });

  it('başka yıldan bir gün başlığında yıl da yazılır', () => {
    show(page([group({ day: '2029-12-31', latestAt: new Date('2029-12-31T09:00:00Z') })]));
    expect(screen.getByRole('region', { name: '31 Aralık 2029 Pazartesi' })).toBeVisible();
  });

  it('saat İstanbul saatiyle yazılır', () => {
    show(page([group({ latestAt: new Date('2030-06-20T11:20:00Z') })]));
    expect(screen.getByText('14:20')).toBeVisible();
  });

  it('okunmamış satır "Okunmadı" metniyle ayrılır (renk tek sinyal değil); okunmuşta yoktur', () => {
    show(
      page([
        group({ unread: 1, href: '/a' }),
        group({ unread: 0, kind: 'contact', category: 'contact', href: '/b' }),
      ]),
    );
    const unread = screen.getByRole('link', { name: /Profiline uyan yeni bir ilan/ });
    expect(within(unread).getByText('Okunmadı')).toBeInTheDocument();
    const read = screen.getByRole('link', { name: /iletişim talebi/ });
    expect(within(read).queryByText('Okunmadı')).toBeNull();
  });

  it('boş kutu sıcak bir boş durum ve ilanlara götüren tek eylem verir; okundu düğmesi yok', () => {
    show(page([]));
    expect(screen.getByRole('heading', { name: 'Henüz bildirimin yok' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'İlanlara göz at' })).toHaveAttribute(
      'href',
      '/ilanlar',
    );
    expect(screen.queryByRole('button', { name: 'Hepsini okundu yap' })).toBeNull();
  });
});

describe('InboxList: okundu işaretleme', () => {
  it('okunmamış satıra dokunmak kayıtlarını bir kez işaretler, göstergeyi kaldırır, rozeti tazeletir', async () => {
    const announced = vi.fn();
    window.addEventListener(INBOX_CHANGED_EVENT, announced);
    const { user } = show(
      page([group({ count: 2, unread: 2, ids: ['a', 'b'], href: '/ilanlar' })]),
    );
    await user.click(screen.getByRole('link', { name: /Profiline uyan 2 yeni ilan/ }));
    expect(mocks.mark).toHaveBeenCalledTimes(1);
    expect(mocks.mark).toHaveBeenCalledWith({ ids: ['a', 'b'] });
    expect(screen.queryByText('Okunmadı')).toBeNull();
    await waitFor(() => expect(announced).toHaveBeenCalled());
    window.removeEventListener(INBOX_CHANGED_EVENT, announced);
  });

  it('son okunmamış satıra dokununca "Hepsini okundu yap" pasifleşir; başka okunmamış varken açık kalır', async () => {
    const { user } = show(
      page([group({ href: '/a' }), group({ kind: 'contact', category: 'contact', href: '/b' })]),
    );
    const markAll = () => screen.getByRole('button', { name: 'Hepsini okundu yap' });
    await user.click(screen.getByRole('link', { name: /Profiline uyan yeni bir ilan/ }));
    expect(markAll()).toBeEnabled();
    await user.click(screen.getByRole('link', { name: /iletişim talebi/ }));
    expect(markAll()).toBeDisabled();
    expect(screen.getByText('Okunmamış bildirimin yok.')).toBeVisible();
  });

  it('okunmuş satıra dokunmak sunucuya gitmez', async () => {
    const { user } = show(page([group({ unread: 0 })]));
    await user.click(screen.getByRole('link', { name: /Profiline uyan yeni bir ilan/ }));
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it('işaretleme başarısız olsa bile gezinme engellenmez ve sayfa düşmez', async () => {
    mocks.mark.mockRejectedValue(new Error('ağ'));
    const { user } = show(page([group()]));
    await user.click(screen.getByRole('link', { name: /Profiline uyan yeni bir ilan/ }));
    expect(screen.getByRole('link', { name: /Profiline uyan yeni bir ilan/ })).toBeVisible();
  });

  it('"Hepsini okundu yap": göstergeleri kaldırır, toast verir, düğme pasifleşir ve sebebini söyler', async () => {
    const { user } = show(
      page([group({ unread: 2 }), group({ kind: 'contact', category: 'contact' })]),
    );
    await user.click(screen.getByRole('button', { name: 'Hepsini okundu yap' }));
    expect(mocks.markAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Bildirimlerin okundu olarak işaretlendi.')).toBeVisible();
    expect(screen.queryByText('Okunmadı')).toBeNull();
    const button = screen.getByRole('button', { name: 'Hepsini okundu yap' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Okunmamış bildirimin yok.')).toBeVisible();
  });

  it('"Hepsini okundu yap" sonrası odak BODY\'ye düşmez: sayfa başlığına gider', async () => {
    const { user } = renderUi(
      <main>
        <ToastProvider>
          <InboxList initial={page([group({ unread: 2 })])} today={TODAY} />
        </ToastProvider>
      </main>,
    );
    await user.click(screen.getByRole('button', { name: 'Hepsini okundu yap' }));
    expect(await screen.findByText('Bildirimlerin okundu olarak işaretlendi.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hepsini okundu yap' })).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Bildirimler' })).toHaveFocus(),
    );
  });

  it('"Hepsini okundu yap" hata verirse düğme açık kalır ve odak onda durur', async () => {
    mocks.markAll.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const { user } = renderUi(
      <main>
        <ToastProvider>
          <InboxList initial={page([group({ unread: 2 })])} today={TODAY} />
        </ToastProvider>
      </main>,
    );
    await user.click(screen.getByRole('button', { name: 'Hepsini okundu yap' }));
    expect(await screen.findByText(SERVER_ERROR)).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByRole('button', { name: 'Hepsini okundu yap' })).toHaveFocus();
  });

  it('çift tıklama tek istek gönderir', async () => {
    let release!: () => void;
    mocks.markAll.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve({ ok: true, data: { marked: 1 } }))),
    );
    const { user } = show(page([group()]));
    await user.dblClick(screen.getByRole('button', { name: 'Hepsini okundu yap' }));
    expect(mocks.markAll).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Hepsini okundu yap/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await act(async () => release());
  });

  it('hata kararlı metinle gösterilir; göstergeler ve düğme yerinde kalır', async () => {
    mocks.markAll.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const { user } = show(page([group()]));
    await user.click(screen.getByRole('button', { name: 'Hepsini okundu yap' }));
    expect(await screen.findByText(SERVER_ERROR)).toBeVisible();
    expect(screen.getByText('Okunmadı')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hepsini okundu yap' })).toBeEnabled();
  });

  it('ağ hatası sayfayı düşürmez; kullanıcı yeniden dener', async () => {
    mocks.markAll.mockRejectedValueOnce(new Error('ağ'));
    const { user } = show(page([group()]));
    await user.click(screen.getByRole('button', { name: 'Hepsini okundu yap' }));
    expect(await screen.findByText(SERVER_ERROR)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hepsini okundu yap' }));
    expect(await screen.findByText('Bildirimlerin okundu olarak işaretlendi.')).toBeVisible();
  });
});

describe('InboxList: daha eski bildirimler', () => {
  it('imleç yoksa düğme yoktur', () => {
    show(page([group()]));
    expect(screen.queryByRole('button', { name: 'Daha eski bildirimler' })).toBeNull();
  });

  it('imleç varsa ister, eski günleri alta ekler, imleç bitince düğme kalkar', async () => {
    mocks.list.mockResolvedValue({
      ok: true,
      data: page(
        [
          group({
            day: '2030-06-17',
            kind: 'contact',
            category: 'contact',
            unread: 0,
            latestAt: new Date('2030-06-17T09:00:00Z'),
          }),
        ],
        { unread: 1 },
      ),
    });
    const { user } = show(page([group()], { nextCursor: '2030-06-19' }));
    await user.click(screen.getByRole('button', { name: 'Daha eski bildirimler' }));
    expect(mocks.list).toHaveBeenCalledWith({ cursor: '2030-06-19' });
    expect(await screen.findByRole('region', { name: '17 Haziran Pazartesi' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Bugün' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Daha eski bildirimler' })).toBeNull();
  });

  it('yükleme hatasında mevcut liste korunur ve düğme yeniden denemeye açık kalır', async () => {
    mocks.list.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const { user } = show(page([group()], { nextCursor: '2030-06-19' }));
    await user.click(screen.getByRole('button', { name: 'Daha eski bildirimler' }));
    expect(await screen.findByText(SERVER_ERROR)).toBeVisible();
    expect(screen.getByRole('link', { name: /Profiline uyan yeni bir ilan/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Daha eski bildirimler' })).toBeEnabled();
  });
});

describe('InboxList: sayfa başlığı', () => {
  it('tek h1 ve e-posta tercihlerine bağlantı vardır', () => {
    show(page([group()]));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bildirimler');
    expect(screen.getByRole('link', { name: 'E-posta tercihlerini düzenle' })).toHaveAttribute(
      'href',
      '/hesap/bildirimler',
    );
  });

  it('fireEvent ile de aynı: kullanılmayan düğme durumu sayfayı kırmaz', () => {
    show(page([group({ unread: 0 })]));
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini okundu yap' }));
    expect(mocks.markAll).not.toHaveBeenCalled();
  });
});

it('201 kayıtlık grup tek tıklamada sınırı aşmadan tamamen okundu olur', async () => {
  const persisted = new Set<string>();
  mocks.mark.mockImplementation(async (input: unknown) => {
    const parsed = markInboxReadInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, errorCode: 'VALIDATION_INVALID' };
    parsed.data.ids.forEach((id) => persisted.add(id));
    return { ok: true, data: { marked: parsed.data.ids.length } };
  });
  show(
    page(
      [
        group({
          count: 201,
          unread: 201,
          ids: Array.from({ length: 201 }, (_, i) => `row-${i}`),
          href: '/ilanlar',
        }),
      ],
      { unread: 100 },
    ),
  );
  fireEvent.click(screen.getByRole('link', { name: /Profiline uyan 201 yeni ilan/ }));
  await waitFor(() => expect(persisted.size).toBe(201));
  expect(mocks.mark).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Okunmadı')).not.toBeInTheDocument();
});

it('grup işaretleme reddedilirse okunmamış göstergesi geri gelir', async () => {
  mocks.mark.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  show(page([group()]));
  fireEvent.click(screen.getByRole('link', { name: /Profiline uyan yeni bir ilan/ }));
  expect(await screen.findByText('Okunmadı')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Hepsini okundu yap' })).toBeEnabled();
});

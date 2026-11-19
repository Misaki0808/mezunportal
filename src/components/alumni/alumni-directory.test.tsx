// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { RETURN_PATH_MAX_LENGTH } from '@/lib/return-path';
import { renderUi } from '@/test/render';
import { AlumniDirectory } from './alumni-directory';
import { AlumniVisibilitySetting } from './visibility-setting';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => router.push.mockReset());
it('genel aramayı ve sektör seçimini URL’ye taşır', async () => {
  const { user } = renderUi(
    <AlumniDirectory
      filter={{ page: 1 }}
      sectors={[{ id: 'aviation', name: 'Havacılık' }]}
      results={{ page: 1, total: 0, hasMore: false, items: [] }}
    />,
  );
  await user.type(screen.getByRole('searchbox', { name: 'Mezun ara' }), 'Deniz');
  await user.selectOptions(screen.getByLabelText('Sektör'), 'aviation');
  expect(router.push).toHaveBeenCalledWith('/mezunlar?q=Deniz&sectorId=aviation');
});

it('uygulanmış sektörü gösterir ve tek yongayla kaldırır', async () => {
  const { user } = renderUi(
    <AlumniDirectory
      filter={{ page: 1, sectorId: 'aviation' }}
      sectors={[{ id: 'aviation', name: 'Havacılık' }]}
      results={{ page: 1, total: 0, hasMore: false, items: [] }}
    />,
  );
  const active = screen.getByLabelText('Etkin filtreler');
  expect(active).toHaveTextContent('Havacılık');
  await user.click(active.querySelector('button')!);
  expect(router.push).toHaveBeenCalledWith('/mezunlar');
});

it('boş kalmış ileri sayfada ilk sayfaya yönlendirir', async () => {
  const { user } = renderUi(
    <AlumniDirectory
      filter={{ page: 9 }}
      sectors={[]}
      results={{ page: 9, total: 1, hasMore: false, items: [] }}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Bu sayfada mezun yok' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'İlk sayfaya dön' }));
  expect(router.push).toHaveBeenCalledWith('/mezunlar');
});
const card = (n: number) => ({
  userId: `u${n}`,
  name: `Kişi ${n}`,
  position: null,
  graduationYear: 2020,
});
it('sayfalama uygulanmış süzgeci korur; yazılıp uygulanmamış taslağı sayfaya taşımaz', async () => {
  const { user } = renderUi(
    <AlumniDirectory
      filter={{ page: 2, company: 'Banka' }}
      sectors={[]}
      results={{ page: 2, total: 60, hasMore: true, items: [card(1)] }}
    />,
  );
  await user.type(screen.getByRole('searchbox', { name: 'Mezun ara' }), 'Taslak');
  const nav = screen.getByRole('navigation', { name: 'Sayfalama' });
  expect(within(nav).getByRole('link', { name: /Sonraki/ })).toHaveAttribute(
    'href',
    '/mezunlar?company=Banka&page=3',
  );
  expect(within(nav).getByRole('link', { name: /Önceki/ })).toHaveAttribute(
    'href',
    '/mezunlar?company=Banka',
  );
  expect(router.push).not.toHaveBeenCalled();
});
it('iletişim isteğinden dönüş bağlantısı geçerli sayfa ve süzgeci taşır', () => {
  renderUi(
    <AlumniDirectory
      filter={{ page: 2, company: 'Banka' }}
      sectors={[]}
      results={{ page: 2, total: 60, hasMore: true, items: [card(1)] }}
    />,
  );
  expect(screen.getByRole('link', { name: /İletişim iste: Kişi 1/ })).toHaveAttribute(
    'href',
    '/iletisim-iste/u1?donus=%2Fmezunlar%3Fcompany%3DBanka%26page%3D2',
  );
});
describe('iletişim isteğinden dönüş yolu uzun süzgeçte kademeli küçülür', () => {
  // `ş` kodlanınca 6 karakterdir: `/mezunlar?q=<82×ş>&page=2` 511, 83×ş 517 karakter olur (sınır 512).
  const link = (filter: object) => {
    renderUi(
      <AlumniDirectory
        filter={{ page: 2, ...filter }}
        sectors={[]}
        results={{ page: 2, total: 60, hasMore: true, items: [card(1)] }}
      />,
    );
    return screen.getByRole('link', { name: /İletişim iste: Kişi 1/ });
  };
  it('sınırdaki yol olduğu gibi kalır', () => {
    const q = 'ş'.repeat(82);
    const full = `/mezunlar?q=${encodeURIComponent(q)}&page=2`;
    expect(full.length).toBeLessThanOrEqual(RETURN_PATH_MAX_LENGTH);
    expect(link({ q })).toHaveAttribute(
      'href',
      `/iletisim-iste/u1?donus=${encodeURIComponent(full)}`,
    );
  });
  it('sınırı aşan arama metni düşer; sayfa ve diğer süzgeçler kalır', () => {
    const q = 'ş'.repeat(83);
    expect(`/mezunlar?q=${encodeURIComponent(q)}&page=2`.length).toBeGreaterThan(
      RETURN_PATH_MAX_LENGTH,
    );
    expect(link({ q, sectorId: 'aviation' })).toHaveAttribute(
      'href',
      `/iletisim-iste/u1?donus=${encodeURIComponent('/mezunlar?sectorId=aviation&page=2')}`,
    );
  });
  it('arama metni düşse de aşıyorsa yalnız /mezunlar; dönüş tamamen kaybolmaz', () => {
    expect(link({ q: 'ş'.repeat(90), company: 'ş'.repeat(90) })).toHaveAttribute(
      'href',
      `/iletisim-iste/u1?donus=${encodeURIComponent('/mezunlar')}`,
    );
  });
});
it('rehber tercihi varsayılan kapalıdır ve yalnız açık seçimi kaydeder', async () => {
  const save = vi.fn().mockResolvedValue({ ok: true, data: { visible: true, eligible: true } });
  const { user } = renderUi(
    <AlumniVisibilitySetting initial={{ visible: false, eligible: true }} save={save} />,
  );
  const checkbox = screen.getByRole('checkbox', { name: /Mezun rehberinde görün/ });
  expect(checkbox).not.toBeChecked();
  await user.click(checkbox);
  expect(save).toHaveBeenCalledWith({ visible: true });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Tercihin kaydedildi.'));
});

it('kaydetme başarısız olursa tercih önceki değere döner', async () => {
  const save = vi.fn().mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  const { user } = renderUi(
    <AlumniVisibilitySetting initial={{ visible: false, eligible: true }} save={save} />,
  );
  const checkbox = screen.getByRole('checkbox', { name: /Mezun rehberinde görün/ });
  await user.click(checkbox);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(checkbox).not.toBeChecked();
});

it('tercih kaydedilirken ikinci değişiklik kilitlenir ve ebeveyn bekleme durumunu alır', async () => {
  let finish!: (value: { ok: true; data: { visible: boolean; eligible: boolean } }) => void;
  const save = vi.fn(
    () =>
      new Promise<{ ok: true; data: { visible: boolean; eligible: boolean } }>((resolve) => {
        finish = resolve;
      }),
  );
  const busy = vi.fn();
  const { user } = renderUi(
    <AlumniVisibilitySetting
      initial={{ visible: false, eligible: true }}
      save={save}
      onBusyChange={busy}
    />,
  );
  const checkbox = screen.getByRole('checkbox', { name: /Mezun rehberinde görün/ });
  await user.click(checkbox);
  expect(checkbox).toBeDisabled();
  expect(busy).toHaveBeenCalledWith(true);
  await user.click(checkbox);
  expect(save).toHaveBeenCalledTimes(1);
  finish({ ok: true, data: { visible: true, eligible: true } });
  expect(await screen.findByText('Tercihin kaydedildi.')).toBeVisible();
  expect(busy).toHaveBeenLastCalledWith(false);
});

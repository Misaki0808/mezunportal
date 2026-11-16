// @vitest-environment jsdom
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
it('rehber tercihi varsayılan kapalıdır ve yalnız açık seçimi kaydeder', async () => {
  const save = vi.fn().mockResolvedValue({ ok: true, data: { visible: true, eligible: true } });
  const { user } = renderUi(
    <AlumniVisibilitySetting initial={{ visible: false, eligible: true }} save={save} />,
  );
  const checkbox = screen.getByRole('checkbox', { name: /Mezun rehberinde görün/ });
  expect(checkbox).not.toBeChecked();
  await user.click(checkbox);
  expect(save).toHaveBeenCalledWith({ visible: true });
  expect(await screen.findByRole('status')).toHaveTextContent('Tercihin kaydedildi.');
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

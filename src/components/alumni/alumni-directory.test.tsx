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
it('rehber tercihi varsayılan kapalıdır ve yalnız açık seçimi kaydeder', async () => {
  const save = vi.fn().mockResolvedValue({ ok: true, data: { visible: true, eligible: true } });
  const { user } = renderUi(
    <AlumniVisibilitySetting initial={{ visible: false, eligible: true }} save={save} />,
  );
  const checkbox = screen.getByRole('checkbox', { name: 'Mezun rehberinde görün' });
  expect(checkbox).not.toBeChecked();
  await user.click(checkbox);
  await user.click(screen.getByRole('button', { name: 'Kaydet' }));
  expect(save).toHaveBeenCalledWith({ visible: true });
  expect(await screen.findByRole('status')).toHaveTextContent('Tercihin kaydedildi.');
});

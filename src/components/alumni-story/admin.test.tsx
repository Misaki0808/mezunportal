// @vitest-environment jsdom
import { screen, within, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
const mocks = vi.hoisted(() => ({ list: vi.fn(), review: vi.fn(), select: vi.fn() }));
vi.mock('@/server/actions/alumni-story', () => ({
  listStoryModeration: mocks.list,
  reviewStory: mocks.review,
  selectMonthlyAlumnus: mocks.select,
}));
import { StoryAdmin } from './admin';
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue({
    ok: true,
    data: [
      {
        id: 's1',
        userId: 'u1',
        name: 'Örnek mezun',
        departmentId: 'd1',
        department: 'YBS',
        body: 'Mezun hikâyesi örneği',
        status: 'PENDING',
        consent: true,
        points: null,
        suspicious: false,
      },
    ],
  });
});
async function open() {
  const { user } = renderUi(<StoryAdmin departments={[{ id: 'd1', name: 'YBS' }]} />);
  await user.click(screen.getByRole('button', { name: 'Hikâyeleri göster' }));
  await user.click(await screen.findByRole('button', { name: 'Düzenleme iste' }));
  return { user, dialog: within(screen.getByRole('dialog')) };
}
it('boş ret gerekçesinde alan altındaki açıklama ve odak birlikte gelir', async () => {
  const { user, dialog } = await open();
  await user.click(dialog.getByRole('button', { name: 'Kararı onayla' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('kısa bir gerekçe');
  expect(dialog.getByLabelText(/Gerekçe/)).toHaveFocus();
  expect(mocks.review).not.toHaveBeenCalled();
});
it('retin sunucu hatası açık pencerenin içinde görünür, gerekçe korunur', async () => {
  mocks.review.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  const { user, dialog } = await open();
  await user.type(dialog.getByLabelText(/Gerekçe/), 'Kapsamı yeniden açıkla');
  await user.click(dialog.getByRole('button', { name: 'Kararı onayla' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent(/.+/);
  expect(dialog.getByLabelText(/Gerekçe/)).toHaveValue('Kapsamı yeniden açıkla');
  expect(mocks.review).toHaveBeenCalledOnce();
});

it('sonraki hikâyede yayın kapalıysa gerekçeli ret eylemine devam eder', async () => {
  const first = {
    id: 's1',
    userId: 'u1',
    name: 'Örnek mezun',
    departmentId: 'd1',
    department: 'YBS',
    body: 'Bir mezun hikâyesi',
    status: 'PENDING',
    consent: true,
    points: null,
    suspicious: false,
  };
  const second = { ...first, id: 's2', userId: 'u2', name: 'Diğer mezun', consent: false };
  mocks.list
    .mockResolvedValueOnce({ ok: true, data: [first, second] })
    .mockResolvedValue({ ok: true, data: [{ ...first, status: 'PUBLISHED' }, second] });
  mocks.review.mockResolvedValue({ ok: true, data: {} });
  const { user } = renderUi(<StoryAdmin departments={[{ id: 'd1', name: 'YBS' }]} />);
  await user.click(screen.getByRole('button', { name: 'Hikâyeleri göster' }));
  await user.click(
    await screen
      .findAllByRole('button', { name: 'Hikâyeyi onayla' })
      .then((buttons) => buttons[0]!),
  );
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Kararı onayla' }),
  );
  const row = within(screen.getByText('Diğer mezun').closest('li')!);
  await waitFor(() => expect(row.getByRole('button', { name: 'Düzenleme iste' })).toHaveFocus());
  expect(row.getByRole('button', { name: 'Hikâyeyi onayla' })).toBeDisabled();
});

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
    data: {
      items: [
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
      nextCursor: null,
    },
  });
});
/**
 * Satır düğmeleri listeyle birlikte belirir ama yükleme geçişi (`useTransition`) bitene dek devre dışıdır
 * (`disabled(pending, …)`); devre dışı düğmeye tıklamak sessizce hiçbir şey yapmaz. Makine yüklüyken test, geçiş bitmeden
 * tıklayabiliyordu: pencere hiç açılmıyor, `<dialog>` çocuksuz kalıyordu (PM kapısı, kart 313). Bu yüzden önce düğmenin
 * etkinleşmesi beklenir.
 *
 * Düğme her yoklamada YENİDEN sorgulanır (kart 379): `Button` sebep yazan devre dışı hâlde düğmeyi `<span>` içine sarar,
 * etkinleşince sarmalayıcıyı bırakır; React düğmeyi yeni bir düğümle değiştirir. Devre dışıyken yakalanan düğüm DOM'dan çıkar ve
 * sonsuza dek devre dışı kalır; `expect(düğüm).toBeEnabled()` o düğüme bakarsa 1 sn sonra düşer (yük altında sorgu geçişin
 * ortasına denk gelince; ölçüm: 40 koşuda 2 kırmızı).
 */
async function clickWhenEnabled(
  user: { click: (element: Element) => Promise<void> },
  find: () => HTMLElement,
) {
  await waitFor(() => expect(find()).toBeEnabled(), { timeout: 3000 });
  await user.click(find());
}
async function open() {
  const { user } = renderUi(<StoryAdmin departments={[{ id: 'd1', name: 'YBS' }]} />);
  await user.click(screen.getByRole('button', { name: 'Hikâyeleri göster' }));
  await clickWhenEnabled(user, () => screen.getByRole('button', { name: 'Düzenleme iste' }));
  return { user, dialog: within(await screen.findByRole('dialog')) };
}
it('boş ret gerekçesinde alan altındaki açıklama ve odak birlikte gelir', async () => {
  const { user, dialog } = await open();
  await user.click(dialog.getByRole('button', { name: 'Kararı onayla' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('kısa bir gerekçe');
  await waitFor(() => expect(dialog.getByLabelText(/Gerekçe/)).toHaveFocus());
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
  // Karar sonrası liste yeniden okunmaz: yüklenmiş sayfalar korunur, onaylanan satır yerinde yayımlanmış olur.
  mocks.list.mockResolvedValue({ ok: true, data: { items: [first, second], nextCursor: null } });
  mocks.review.mockResolvedValue({ ok: true, data: {} });
  const { user } = renderUi(<StoryAdmin departments={[{ id: 'd1', name: 'YBS' }]} />);
  await user.click(screen.getByRole('button', { name: 'Hikâyeleri göster' }));
  await clickWhenEnabled(
    user,
    () => screen.getAllByRole('button', { name: 'Hikâyeyi onayla' })[0]!,
  );
  await user.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kararı onayla' }),
  );
  const row = within(screen.getByText('Diğer mezun').closest('li')!);
  await waitFor(() => expect(row.getByRole('button', { name: 'Düzenleme iste' })).toHaveFocus());
  expect(row.getByRole('button', { name: 'Hikâyeyi onayla' })).toBeDisabled();
});

it('düğme etkinleşirken DOM düğümü yenilense de bekleme taze düğüme tıklar (bayat düğüm yarışı, kart 379)', async () => {
  let release!: () => void;
  mocks.list.mockImplementationOnce(
    () =>
      new Promise(
        (resolve) => (release = () => resolve({ ok: true, data: { items: [], nextCursor: null } })),
      ),
  );
  const { user } = renderUi(<StoryAdmin departments={[{ id: 'd1', name: 'YBS' }]} />);
  const load = () => screen.getByRole('button', { name: 'Hikâyeleri göster' });
  await user.click(load());
  // Yükleme sürerken düğme sebep yazan devre dışı hâldedir; etkinleşince düğüm yenilenir.
  await waitFor(() => expect(load()).toBeDisabled());
  const clicking = clickWhenEnabled(user, load);
  release();
  await clicking;
  expect(mocks.list).toHaveBeenCalledTimes(2);
});

const story = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `s${n}`,
  userId: `u${n}`,
  name: `Mezun ${n}`,
  departmentId: 'd1',
  department: 'YBS',
  body: `Hikâye ${n}`,
  status: 'PENDING',
  consent: true,
  points: null,
  suspicious: false,
  ...extra,
});
async function show() {
  const { user } = renderUi(<StoryAdmin departments={[{ id: 'd1', name: 'YBS' }]} />);
  await user.click(screen.getByRole('button', { name: 'Hikâyeleri göster' }));
  return user;
}

it('ilk yanıt sayfa boyutuyla sınırlıdır; "Daha fazla göster" imleçle sıradakini ekler, çift satır olmaz', async () => {
  mocks.list
    .mockResolvedValueOnce({
      ok: true,
      data: { items: [story(1), story(2)], nextCursor: '5:10:s2' },
    })
    .mockResolvedValueOnce({ ok: true, data: { items: [story(2), story(3)], nextCursor: null } });
  const user = await show();
  expect(await screen.findByText('Mezun 2')).toBeInTheDocument();
  expect(screen.queryByText('Mezun 3')).toBeNull();
  expect(mocks.list).toHaveBeenLastCalledWith({ departmentId: 'd1' });
  await clickWhenEnabled(user, () => screen.getByRole('button', { name: 'Daha fazla göster' }));
  expect(await screen.findByText('Mezun 3')).toBeInTheDocument();
  expect(mocks.list).toHaveBeenLastCalledWith({ departmentId: 'd1', cursor: '5:10:s2' });
  expect(screen.getAllByText('Mezun 2')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Daha fazla göster' })).toBeNull();
});

it('yüklü hikâyelerin hepsi işlenince sıradaki sayfa kendiliğinden gelir; boş durum yalnız imleç bitince görünür', async () => {
  mocks.list
    .mockResolvedValueOnce({ ok: true, data: { items: [story(1)], nextCursor: 'c1' } })
    .mockResolvedValueOnce({ ok: true, data: { items: [story(2)], nextCursor: null } });
  mocks.review.mockResolvedValue({ ok: true, data: {} });
  const user = await show();
  await clickWhenEnabled(user, () => screen.getByRole('button', { name: 'Düzenleme iste' }));
  const dialog = within(await screen.findByRole('dialog'));
  await user.type(dialog.getByLabelText(/Gerekçe/), 'Kapsamı yeniden açıkla');
  await user.click(dialog.getByRole('button', { name: 'Kararı onayla' }));
  expect(await screen.findByText('Mezun 2')).toBeInTheDocument();
  expect(screen.queryByText('Mezun 1')).toBeNull();
  expect(screen.queryByText(/incelenecek veya seçilecek hikâye yok/)).toBeNull();
  expect(mocks.list).toHaveBeenCalledTimes(2);
  expect(mocks.list).toHaveBeenLastCalledWith({ departmentId: 'd1', cursor: 'c1' });
});

it('imleç sürerken liste boşsa ve sıradaki sayfa gelmezse döngüye girmez, düğme kalır', async () => {
  mocks.list
    .mockResolvedValueOnce({ ok: true, data: { items: [], nextCursor: 'c1' } })
    .mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  await show();
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  await screen.findByRole('button', { name: 'Daha fazla göster' });
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(mocks.list).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/incelenecek veya seçilecek hikâye yok/)).toBeNull();
});

it('şüpheli kayıt yayımlanınca listeden düşer (sunucu kuralıyla aynı)', async () => {
  mocks.list.mockResolvedValue({
    ok: true,
    data: { items: [story(1, { suspicious: true }), story(2)], nextCursor: null },
  });
  mocks.review.mockResolvedValue({ ok: true, data: {} });
  const user = await show();
  await clickWhenEnabled(
    user,
    () => screen.getAllByRole('button', { name: 'Hikâyeyi onayla' })[0]!,
  );
  await user.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kararı onayla' }),
  );
  await waitFor(() => expect(screen.queryByText('Mezun 1')).toBeNull());
  expect(screen.getByText('Mezun 2')).toBeInTheDocument();
  expect(mocks.list).toHaveBeenCalledTimes(1);
});

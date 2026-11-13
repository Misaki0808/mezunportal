// @vitest-environment jsdom
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import type { ContactRequestItem } from '@/contracts/contact-request';
import { renderWithToasts } from '@/test/render';
import { ContactList } from './contact-list';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  respond: vi.fn(),
  revoke: vi.fn(),
  withdraw: vi.fn(),
}));
vi.mock('@/server/actions/contact-request', () => ({
  listContactRequests: mocks.list,
  respondToContactRequest: mocks.respond,
  revokeContactRequest: mocks.revoke,
  withdrawContactRequest: mocks.withdraw,
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => vi.resetAllMocks());
const item = (
  id: string,
  status: ContactRequestItem['status'] = 'PENDING',
): ContactRequestItem => ({
  id,
  status,
  counterpart: { userId: `member-${id}`, name: `Örnek ${id}` },
  origin: null,
  fields: ['EMAIL'],
  message: null,
  createdAt: new Date('2026-11-13T08:00:00Z'),
  decidedAt: null,
  closedAt: null,
  revealed: null,
});
function setup(items: ContactRequestItem[], box: 'INCOMING' | 'OUTGOING' = 'INCOMING') {
  return renderWithToasts(
    <main>
      <h1>İletişim talepleri</h1>
      <ContactList initialBox={box} initial={{ items, nextCursor: null }} />
    </main>,
  );
}
function row(id: string) {
  return screen.getByRole('heading', { name: `Örnek ${id}` }).closest('div')!.parentElement!
    .parentElement!;
}

it('onaydan sonra sıradaki bekleyen kaydın kararına odaklanır; onay geri alma düğmesine sıçramaz', async () => {
  mocks.respond.mockResolvedValue({ ok: true, data: { requestId: 'ilk', status: 'APPROVED' } });
  mocks.list.mockResolvedValue({
    ok: true,
    data: { items: [item('ilk', 'APPROVED'), item('sonraki')], nextCursor: null },
  });
  const { user } = setup([item('ilk'), item('sonraki')]);
  await user.click(within(row('ilk')).getByRole('button', { name: 'Onayla' }));
  await waitFor(() =>
    expect(within(row('sonraki')).getByRole('button', { name: 'Onayla' })).toHaveFocus(),
  );
  expect(mocks.respond).toHaveBeenCalledWith({ requestId: 'ilk', decision: 'APPROVE' });
});
it('son bekleyen talep reddedilince sonuç başlığına odaklanır; geçici tabindex blur ile temizlenir', async () => {
  mocks.respond.mockResolvedValue({ ok: true, data: { requestId: 'son', status: 'REJECTED' } });
  mocks.list.mockResolvedValue({
    ok: true,
    data: { items: [item('son', 'REJECTED')], nextCursor: null },
  });
  const { user } = setup([item('son')]);
  await user.click(screen.getByRole('button', { name: 'Reddet' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('Talebi reddet')).toBeVisible();
  expect(within(dialog).queryByText(/Paylaşımı kapat/)).toBeNull();
  await user.click(within(dialog).getByRole('button', { name: 'Reddet' }));
  const heading = screen.getByRole('heading', { name: 'İletişim talepleri' });
  await waitFor(() => expect(heading).toHaveFocus());
  heading.blur();
  expect(heading).not.toHaveAttribute('tabindex');
});
it('başarısız kararda odak ve bekleyen eylem korunur', async () => {
  mocks.respond.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  const { user } = setup([item('ilk'), item('sonraki')]);
  const approve = within(row('ilk')).getByRole('button', { name: 'Onayla' });
  await user.click(approve);
  await screen.findAllByRole('alert');
  expect(approve).toHaveFocus();
  expect(mocks.list).not.toHaveBeenCalled();
});
it.each([
  ['INCOMING', 'APPROVED', 'Onayı geri al', 'Paylaşımı kapat'],
  ['OUTGOING', 'PENDING', 'Talebi geri çek', 'Talebi geri çek'],
] as const)(
  '%s %s kapatmasının başlığı kendi işlemini anlatır',
  async (box, status, action, title) => {
    const { user } = setup([item('ilk', status)], box);
    await user.click(screen.getByRole('button', { name: action }));
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: title })).toBeVisible();
  },
);

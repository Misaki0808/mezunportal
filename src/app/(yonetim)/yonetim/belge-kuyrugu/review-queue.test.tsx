// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { ReviewQueue } from './review-queue';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
const initial = {
  items: [
    {
      id: 'doc-1',
      departmentId: 'd',
      departmentName: 'YBS',
      graduationYear: 2024,
      submittedAt: new Date('2026-01-01T00:00:00Z'),
      applicantName: 'Örnek Kişi',
      maskedEmail: 'o***@e***.test',
    },
  ],
  nextCursor: null,
};

describe('ReviewQueue', () => {
  it('ret için gerekçe ister, boş kararı göndermez', async () => {
    const review = vi.fn();
    const { user } = renderUi(<ReviewQueue initial={initial} list={vi.fn()} review={review} />);
    expect(screen.getByText('o***@e***.test')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reddet' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Reddet' }).at(-1)!);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(review).not.toHaveBeenCalled();
  });
  it('boş kuyruk için bir yönlendirme gösterir', () => {
    renderUi(
      <ReviewQueue initial={{ items: [], nextCursor: null }} list={vi.fn()} review={vi.fn()} />,
    );
    expect(screen.getByText('İncelenecek başvuru yok')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yenile' })).toBeInTheDocument();
  });
  it('gerekçeli reddi gönderir ve kararı listeden kaldırır', async () => {
    const review = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { documentId: 'doc-1', decision: 'REJECT' } });
    const { user } = renderUi(<ReviewQueue initial={initial} list={vi.fn()} review={review} />);
    await user.click(screen.getByRole('button', { name: 'Reddet' }));
    await user.type(screen.getByLabelText(/Ret nedeni/), 'Belge okunmuyor');
    await user.click(screen.getAllByRole('button', { name: 'Reddet' }).at(-1)!);
    expect(await screen.findByRole('status')).toHaveTextContent('Kararın kaydedildi.');
    expect(review).toHaveBeenCalledWith({
      documentId: 'doc-1',
      decision: 'REJECT',
      reason: 'Belge okunmuyor',
    });
    expect(screen.queryByText('Örnek Kişi')).not.toBeInTheDocument();
  });
});

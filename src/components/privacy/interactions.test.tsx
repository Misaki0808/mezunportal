// @vitest-environment jsdom
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderUi } from '@/test/render';
import { ToastProvider } from '@/components/ui';
import { CONSENT_DOCUMENTS, type ConsentState } from '@/contracts/privacy';
import { ConsentForm } from './consent-form';
import { DeleteForm } from './delete-form';
const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  remove: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/server/actions/privacy', () => ({
  recordConsents: mocks.record,
  deleteAccount: mocks.remove,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  vi.clearAllMocks();
});
const state: ConsentState = {
  blocking: true,
  documents: CONSENT_DOCUMENTS.map((documentType) => ({
    documentType,
    currentVersion: 'taslak-1',
    required: documentType !== 'CROSS_BORDER_TRANSFER',
    lastDecision: null,
    needsAction: true,
  })),
};
it('zorunlu kutular seçilmeden kayıt göndermez; isteğe bağlı kutuyu zorlamaz', async () => {
  const { user } = renderUi(
    <ToastProvider>
      <ConsentForm state={state} />
    </ToastProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Seçimlerimi kaydet' }));
  expect(mocks.record).not.toHaveBeenCalled();
  expect(screen.getAllByText('Devam etmek için bu metni onayla.')).toHaveLength(2);
  const boxes = screen.getAllByRole('checkbox');
  await user.click(boxes[0]!);
  await user.click(boxes[1]!);
  mocks.record.mockResolvedValue({ ok: true, data: { ...state, blocking: false } });
  await user.click(screen.getByRole('button', { name: 'Seçimlerimi kaydet' }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/hesap'));
  expect(
    mocks.record.mock.calls[0]![0].decisions.find(
      (d: { documentType: string }) => d.documentType === 'CROSS_BORDER_TRANSFER',
    ).granted,
  ).toBe(false);
});
it('eski sürüm hatası yenileme eylemi sunar; ham hata metni göstermez', async () => {
  const accepted = {
    ...state,
    documents: state.documents.map((d) => ({
      ...d,
      lastDecision: { version: 'taslak-1', granted: true, decidedAt: new Date() },
    })),
  };
  mocks.record.mockResolvedValue({ ok: false, errorCode: 'CONSENT_VERSION_OUTDATED' });
  const { user } = renderUi(
    <ToastProvider>
      <ConsentForm state={accepted} />
    </ToastProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Seçimlerimi kaydet' }));
  await user.click(await screen.findByRole('button', { name: 'Yeniden dene' }));
  expect(mocks.refresh).toHaveBeenCalled();
});
it('hesap silme e-posta ve ikinci onay olmadan çağrılmaz; anonimleştirme tercihini aynen iletir', async () => {
  const { user } = renderUi(
    <ToastProvider>
      <DeleteForm />
    </ToastProvider>,
  );
  await user.click(screen.getByRole('radio', { name: /Adımı kaldırıp içerikleri bırak/ }));
  await user.type(screen.getByLabelText(/Onaylamak için/), 'sahte@example.invalid');
  await user.click(screen.getByRole('button', { name: 'Hesabımı sil' }));
  expect(mocks.remove).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(/Bu işlem geri alınamaz/)).toBeVisible();
  mocks.remove.mockResolvedValue({ ok: true, data: { deleted: true } });
  await user.click(within(dialog).getByRole('button', { name: 'Hesabımı sil' }));
  expect(mocks.remove).toHaveBeenCalledWith({
    publishedContent: 'ANONYMIZE',
    confirmEmail: 'sahte@example.invalid',
  });
  expect(await screen.findByRole('heading', { name: 'Hesabın silindi' })).toBeVisible();
});

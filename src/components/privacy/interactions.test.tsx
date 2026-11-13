// @vitest-environment jsdom
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderUi } from '@/test/render';
import { ToastProvider } from '@/components/ui';
import { CONSENT_DOCUMENTS, type ConsentState } from '@/contracts/privacy';
import { ConsentForm } from './consent-form';
import { DeleteForm } from './delete-form';
import { VisibilityForm } from './visibility-form';
const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  remove: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  setVisibility: vi.fn(),
}));
vi.mock('@/server/actions/privacy', () => ({
  recordConsents: mocks.record,
  deleteAccount: mocks.remove,
  setFieldVisibility: mocks.setVisibility,
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
  // İlk onaydan sonra hesap ayarları değil ana sayfa: sıradaki adım (doğrulama/başlangıç) orada kart olarak yazılıdır.
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'));
  expect(
    mocks.record.mock.calls[0]![0].decisions.find(
      (d: { documentType: string }) => d.documentType === 'CROSS_BORDER_TRANSFER',
    ).granted,
  ).toBe(false);
});
it('zorunlu onaydan sonra verilen hedefe döner', async () => {
  const { user } = renderUi(
    <ToastProvider>
      <ConsentForm state={state} returnTo="/hesap/gizlilik" />
    </ToastProvider>,
  );
  const boxes = screen.getAllByRole('checkbox');
  await user.click(boxes[0]!);
  await user.click(boxes[1]!);
  mocks.record.mockResolvedValue({ ok: true, data: { ...state, blocking: false } });
  await user.click(screen.getByRole('button', { name: 'Seçimlerimi kaydet' }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/hesap/gizlilik'));
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
      <DeleteForm currentEmail="sahte@example.invalid" />
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
it('hesap silmede boş e-posta alan yanında ne yapılacağını söyler', async () => {
  const { user } = renderUi(
    <ToastProvider>
      <DeleteForm currentEmail="dogru@example.invalid" />
    </ToastProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Hesabımı sil' }));
  expect(screen.getByText('E-posta adresini yaz.')).toBeVisible();
  expect(screen.getByLabelText(/Onaylamak için/)).toHaveFocus();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('hesap silmede farklı adres onay penceresinden önce alan yanında açıklanır ve alana odaklanır', async () => {
  const { user } = renderUi(
    <ToastProvider>
      <DeleteForm currentEmail="dogru@example.invalid" />
    </ToastProvider>,
  );
  const email = screen.getByLabelText(/Onaylamak için/);
  await user.type(email, 'yanlis@example.invalid');
  await user.click(screen.getByRole('button', { name: 'Hesabımı sil' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('Yazdığın e-posta hesabındaki adresle eşleşmiyor.')).toBeVisible();
  expect(email).toHaveFocus();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('adres sonradan değişmişse sunucu uyuşmazlığını da onay penceresinden alana taşır', async () => {
  const { user } = renderUi(
    <ToastProvider>
      <DeleteForm currentEmail="eski@example.invalid" />
    </ToastProvider>,
  );
  await user.type(screen.getByLabelText(/Onaylamak için/), 'eski@example.invalid');
  await user.click(screen.getByRole('button', { name: 'Hesabımı sil' }));
  mocks.remove.mockResolvedValue({ ok: false, errorCode: 'ACCOUNT_DELETE_CONFIRMATION_MISMATCH' });
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Hesabımı sil' }),
  );
  expect(await screen.findByText('Yazdığın e-posta hesabındaki adresle eşleşmiyor.')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('gizlilikte değişiklikler tek kaydet ile gönderilir, kaydedilmemiş durum duyurulur', async () => {
  const initial = {
    fields: [
      { field: 'EMAIL' as const, level: 'ON_APPROVED_REQUEST' as const, isDefault: true },
      { field: 'PHONE' as const, level: 'ON_APPROVED_REQUEST' as const, isDefault: true },
    ],
  };
  const result = {
    fields: initial.fields.map((item) => ({
      ...item,
      level: 'PRIVATE' as const,
      isDefault: false,
    })),
  };
  mocks.setVisibility.mockResolvedValue({ ok: true, data: result });
  const { user } = renderUi(
    <ToastProvider>
      <VisibilityForm initial={initial} />
    </ToastProvider>,
  );
  await user.selectOptions(screen.getByLabelText('E-posta'), 'PRIVATE');
  await user.selectOptions(screen.getByLabelText('Telefon'), 'PRIVATE');
  expect(screen.getByText(/Kaydedilmemiş değişikliklerin var/)).toBeVisible();
  expect(mocks.setVisibility).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(mocks.setVisibility).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Değişikliklerin kaydedildi.')).toBeVisible();
  expect(screen.queryByText(/Kaydedilmemiş değişikliklerin var/)).not.toBeInTheDocument();
});
it('tek kaydet sırasında kısmi hata kaydedilenleri belirtir ve yalnız kalanı yeniden dener', async () => {
  const initial = {
    fields: [
      { field: 'EMAIL' as const, level: 'ON_APPROVED_REQUEST' as const, isDefault: true },
      { field: 'PHONE' as const, level: 'ON_APPROVED_REQUEST' as const, isDefault: true },
    ],
  };
  const partial = {
    fields: [
      { ...initial.fields[0]!, level: 'PRIVATE' as const, isDefault: false },
      initial.fields[1]!,
    ],
  };
  const done = {
    fields: partial.fields.map((field) => ({
      ...field,
      level: 'PRIVATE' as const,
      isDefault: false,
    })),
  };
  mocks.setVisibility
    .mockResolvedValueOnce({ ok: true, data: partial })
    .mockResolvedValueOnce({ ok: false, errorCode: 'SERVER_UNEXPECTED' })
    .mockResolvedValueOnce({ ok: true, data: done });
  const { user } = renderUi(
    <ToastProvider>
      <VisibilityForm initial={initial} />
    </ToastProvider>,
  );
  await user.selectOptions(screen.getByLabelText('E-posta'), 'PRIVATE');
  await user.selectOptions(screen.getByLabelText('Telefon'), 'PRIVATE');
  await user.click(screen.getByRole('button', { name: 'Kaydet' }));
  expect(
    await screen.findByText('Bazı değişiklikler kaydedildi. Kalanları yeniden kaydet.'),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(mocks.setVisibility).toHaveBeenCalledTimes(3));
  expect(mocks.setVisibility).toHaveBeenLastCalledWith({ field: 'PHONE', level: 'PRIVATE' });
});

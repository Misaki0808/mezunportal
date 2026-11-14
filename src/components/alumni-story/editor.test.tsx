// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MyStory } from '@/contracts/alumni-story';
import { renderUi } from '@/test/render';

const mocks = vi.hoisted(() => ({ save: vi.fn(), consent: vi.fn(), submit: vi.fn() }));
vi.mock('@/server/actions/alumni-story', () => ({
  saveStory: mocks.save,
  setStoryConsent: mocks.consent,
  submitStory: mocks.submit,
}));

import { StoryEditor } from './editor';

const BODY =
  'Staj arayışım ikinci sınıfın sonunda başladı; en çok işe yarayan şey mezunlarla konuşmaktı.';
const departments = [
  { id: 'd1', name: 'Yönetim Bilişim Sistemleri' },
  { id: 'd2', name: 'İşletme' },
];
const story = (over: Partial<MyStory> = {}): MyStory => ({
  id: 's1',
  departmentId: 'd1',
  department: 'Yönetim Bilişim Sistemleri',
  body: BODY,
  status: 'DRAFT',
  consent: false,
  moderationReason: null,
  updatedAt: new Date('2030-01-01T10:00:00Z'),
  ...over,
});
const show = (initial: MyStory[] = [story()]) =>
  renderUi(
    <main>
      <StoryEditor departments={departments} initial={initial} />
    </main>,
  );
const texts = () => screen.queryAllByRole('alert').filter((alert) => alert.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.save.mockImplementation(async (input) => ({
    ok: true,
    data: story({ body: input.body, consent: input.consent }),
  }));
  mocks.submit.mockResolvedValue({ ok: true, data: story({ status: 'PENDING', consent: true }) });
  mocks.consent.mockImplementation(async (input) => ({
    ok: true,
    data: story({ consent: input.consent }),
  }));
});

describe('hikâye editörü: odak ve duyurular', () => {
  it('"Kaydet" sonrası odak sonuç metnine gider; metin tek kez ve `status` olarak görünür', async () => {
    const { user } = show();
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Hikâyen kaydedildi.')).toBeVisible();
    expect(screen.getAllByText('Hikâyen kaydedildi.')).toHaveLength(1);
    // Düğme işlem sürerken yer değiştirir; odak BODY'ye düşmez, sonuç metnine gider.
    await waitFor(() => expect(screen.getByText('Hikâyen kaydedildi.')).toHaveFocus());
    expect(texts()).toHaveLength(0);
  });

  it('yayın izni olmadan gönderme: hata onay kutusuna bağlanır, odak oraya gider, tek duyuru', async () => {
    const { user } = show();
    await user.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
    const consent = await screen.findByRole('switch');
    await waitFor(() => expect(consent).toHaveFocus());
    expect(consent).toHaveAttribute('aria-invalid', 'true');
    expect(consent).toHaveAccessibleDescription(/İnceleme için yayın izni gerekir\./);
    expect(texts()).toHaveLength(1);
    expect(screen.getAllByText('İnceleme için yayın izni gerekir.')).toHaveLength(1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('hata sonra başarıda temizlenir: izin verilip gönderilince hata metni kalmaz', async () => {
    const { user } = show();
    await user.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
    await screen.findByText('İnceleme için yayın izni gerekir.');
    await user.click(screen.getByRole('switch'));
    expect(screen.queryByText('İnceleme için yayın izni gerekir.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
    expect(await screen.findByText('Hikâyen incelemeye gönderildi.')).toBeVisible();
    expect(texts()).toHaveLength(0);
  });

  it('geçersiz metin: hata metin alanına bağlanır, odak oraya gider, tek duyuru', async () => {
    const { user } = show([story({ body: 'kısa' })]);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    const body = screen.getByLabelText('Hikâyen');
    await waitFor(() => expect(body).toHaveFocus());
    expect(body).toHaveAccessibleDescription(/Alanları kontrol edip yeniden dene\./);
    expect(texts()).toHaveLength(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sunucu hatası tek `alert` olur; sonra gelen başarıda bayat hata ve bayat başarı kalmaz', async () => {
    mocks.save.mockResolvedValueOnce({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const { user } = show();
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(
      await screen.findByText('Beklenmeyen bir sorun oluştu. Biraz sonra tekrar dene.'),
    ).toBeVisible();
    expect(texts()).toHaveLength(1);
    expect(screen.queryByRole('status')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Hikâyen kaydedildi.')).toBeVisible();
    expect(screen.queryByText(/Beklenmeyen bir sorun/)).toBeNull();
  });

  it('bölüm değişince önceki "kaydedildi" iletisi silinir', async () => {
    const { user } = show();
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    await screen.findByText('Hikâyen kaydedildi.');
    await user.selectOptions(screen.getByLabelText('Bölüm'), 'd2');
    expect(screen.queryByText('Hikâyen kaydedildi.')).toBeNull();
  });

  it('izin değişince önceki "kaydedildi" iletisi yerini yenisine bırakır, ikisi birlikte durmaz', async () => {
    const { user } = show();
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    await screen.findByText('Hikâyen kaydedildi.');
    await user.click(screen.getByRole('switch'));
    expect(await screen.findByText('Yayın tercihin kaydedildi.')).toBeVisible();
    expect(screen.queryByText('Hikâyen kaydedildi.')).toBeNull();
  });

  it('"İncelemeye gönder" başarısında odak sonuç metnine gider', async () => {
    const { user } = show([story({ consent: true })]);
    await user.click(screen.getByRole('button', { name: 'İncelemeye gönder' }));
    expect(await screen.findByText('Hikâyen incelemeye gönderildi.')).toBeVisible();
    await waitFor(() => expect(screen.getByText('Hikâyen incelemeye gönderildi.')).toHaveFocus());
  });

  it('izin anahtarı değişince odak anahtarda kalır (işlem sırasında pasifleşse de geri döner)', async () => {
    const { user } = show();
    await user.click(screen.getByRole('switch'));
    await screen.findByText('Yayın tercihin kaydedildi.');
    await waitFor(() => expect(screen.getByRole('switch')).toHaveFocus());
  });

  it('sunucu hatasında odak hata metnine gider', async () => {
    mocks.save.mockResolvedValueOnce({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const { user } = show();
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    const message = await screen.findByText(
      'Beklenmeyen bir sorun oluştu. Biraz sonra tekrar dene.',
    );
    await waitFor(() => expect(message).toHaveFocus());
  });
});

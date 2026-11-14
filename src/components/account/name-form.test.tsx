// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToasts } from '@/test/render';

import { NameForm } from './name-form';

const update = vi.fn();
beforeEach(() => {
  update.mockReset();
  update.mockImplementation(async ({ name }: { name: string }) => ({
    ok: true,
    data: { name, changed: true },
  }));
});

const field = () => screen.getByLabelText('Ad soyad');
const save = () => screen.getByRole('button', { name: 'Kaydet' });
const INVALID = 'Adını yalnız harf, boşluk, kesme işareti ve tire kullanarak 2–80 karakter yaz.';

describe('ad soyad formu', () => {
  it('geçerli adı kırpılmış olarak sunucuya iletir ve başarıyı toast ile söyler', async () => {
    const { user } = renderWithToasts(<NameForm initialName="ayse yilmaz" update={update} />);
    await user.clear(field());
    await user.type(field(), '  Ayşe   Yılmaz ');
    await user.click(save());
    expect(update).toHaveBeenCalledWith({ name: 'Ayşe Yılmaz' });
    expect(await screen.findByText('Adın güncellendi.')).toBeVisible();
    expect(field()).toHaveValue('Ayşe Yılmaz');
  });

  it('değişiklik yoksa "zaten böyle" der', async () => {
    update.mockResolvedValue({ ok: true, data: { name: 'Ayşe Yılmaz', changed: false } });
    const { user } = renderWithToasts(<NameForm initialName="Ayşe Yılmaz" update={update} />);
    await user.click(save());
    expect(await screen.findByText('Adın zaten böyle kayıtlı.')).toBeVisible();
  });

  it('rakamlı ad sunucuya gitmeden alanın altında reddedilir ve alan odak alır', async () => {
    const { user } = renderWithToasts(<NameForm initialName="r1" update={update} />);
    await user.click(save());
    expect(update).not.toHaveBeenCalled();
    expect(await screen.findByText(INVALID)).toBeVisible();
    expect(field()).toHaveFocus();
    expect(field()).toBeInvalid();
  });

  it('hata, düzeltilip başarıyla kaydedilince ekranda kalmaz', async () => {
    const { user } = renderWithToasts(<NameForm initialName="r1" update={update} />);
    await user.click(save());
    await screen.findByText(INVALID);
    await user.clear(field());
    expect(screen.queryByText(INVALID)).toBeNull();
    await user.type(field(), 'Ayşe Yılmaz');
    await user.click(save());
    expect(await screen.findByText('Adın güncellendi.')).toBeVisible();
    expect(screen.queryByText(INVALID)).toBeNull();
    expect(field()).not.toBeInvalid();
  });

  it('sunucu alan hatasını alanın altında gösterir, yazılan korunur, başarı bildirimi yok', async () => {
    update.mockResolvedValue({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: { name: 'ACCOUNT_NAME_INVALID' },
    });
    const { user } = renderWithToasts(<NameForm initialName="Ayşe Yılmaz" update={update} />);
    await user.click(save());
    expect(await screen.findByText(INVALID)).toBeVisible();
    expect(field()).toHaveValue('Ayşe Yılmaz');
    expect(screen.queryByText('Adın güncellendi.')).toBeNull();
  });

  it('hız sınırı gibi alan dışı hata form altında kararlı metinle görünür', async () => {
    update.mockResolvedValue({ ok: false, errorCode: 'RATE_LIMITED' });
    const { user } = renderWithToasts(<NameForm initialName="Ayşe Yılmaz" update={update} />);
    await user.click(save());
    expect(
      await screen.findByText('Çok fazla deneme yaptın. Biraz bekleyip tekrar dene.'),
    ).toBeVisible();
    expect(screen.queryByText(INVALID)).toBeNull();
  });

  it('çift gönderim tek istek', async () => {
    let release!: () => void;
    update.mockImplementation(
      ({ name }: { name: string }) =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, data: { name, changed: true } });
        }),
    );
    renderWithToasts(<NameForm initialName="Ayşe Yılmaz" update={update} />);
    const form = save().closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(update).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(save()).not.toHaveAttribute('aria-busy', 'true'));
  });

  it('ilk girişte türetilmiş ad geçersizse ipucu bunu söyler; geçerliyse sade ipucu görünür', () => {
    const { unmount } = renderWithToasts(
      <NameForm initialName="ayse yilmaz1989" update={update} variant="onboarding" />,
    );
    expect(screen.getByRole('heading', { name: 'Adın doğru mu?' })).toBeVisible();
    expect(field()).toHaveAccessibleDescription(/E-postandan türetildi ve eksik görünüyor/);
    unmount();
    renderWithToasts(<NameForm initialName="Ayşe Yılmaz" update={update} variant="onboarding" />);
    expect(field()).toHaveAccessibleDescription(
      'Mentor kartında ve randevu e-postalarında görünür.',
    );
  });

  it('başarılı kayıttan sonra "E-postandan türetildi" ipucu kalkar; geçersiz ad hâlâ kayıtlıysa kalır', async () => {
    const { user } = renderWithToasts(
      <NameForm initialName="ayse yilmaz1989" update={update} variant="onboarding" />,
    );
    expect(field()).toHaveAccessibleDescription(/E-postandan türetildi ve eksik görünüyor/);
    await user.clear(field());
    await user.type(field(), 'Ayşe Yılmaz');
    // Yazarken (henüz kaydedilmeden) ipucu değişmez: ölçüt kaydedilmiş ad.
    expect(field()).toHaveAccessibleDescription(/E-postandan türetildi ve eksik görünüyor/);
    await user.click(save());
    expect(await screen.findByText('Adın güncellendi.')).toBeVisible();
    expect(field()).toHaveAccessibleDescription(
      'Mentor kartında ve randevu e-postalarında görünür.',
    );
    expect(field()).not.toHaveAccessibleDescription(/E-postandan türetildi/);
  });

  it('kayıt başarısızsa türetilmiş ad ipucu kalır', async () => {
    update.mockResolvedValue({ ok: false, errorCode: 'RATE_LIMITED' });
    const { user } = renderWithToasts(
      <NameForm initialName="r1" update={update} variant="onboarding" />,
    );
    await user.clear(field());
    await user.type(field(), 'Ayşe Yılmaz');
    await user.click(save());
    await screen.findByText('Çok fazla deneme yaptın. Biraz bekleyip tekrar dene.');
    expect(field()).toHaveAccessibleDescription(/E-postandan türetildi ve eksik görünüyor/);
  });

  it('ayarlar sayfasında kural ipucu görünür, kart başlığı yoktur', () => {
    renderWithToasts(<NameForm initialName="Ayşe Yılmaz" update={update} />);
    expect(field()).toHaveAccessibleDescription(/Harf, boşluk, kesme işareti ve tire kullan/);
    expect(screen.queryByRole('heading', { name: 'Adın doğru mu?' })).toBeNull();
  });
});

// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { ExperienceForm } from './experience-form';
import { emptyState } from './form-state';

// jsdom'da <dialog>.showModal/close yok; açık/kapalı niteliği taklit edilir (dialog.test.tsx ile aynı).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const departments = [{ id: 'd1', name: 'Yönetim Bilişim Sistemleri' }];
const detail = (id = 'e1') => ({ ok: true as const, data: { id } });

function setup(overrides: Partial<Parameters<typeof ExperienceForm>[0]> = {}) {
  const save = vi.fn().mockResolvedValue(detail());
  const submit = vi
    .fn()
    .mockResolvedValue({ ok: true, data: { experienceId: 'e1', status: 'PENDING' } });
  const view = renderUi(
    <ExperienceForm
      departments={departments}
      save={save as never}
      submit={submit as never}
      {...overrides}
    />,
  );
  return { save, submit, ...view };
}

async function fillInternship(user: ReturnType<typeof setup>['user']) {
  await user.type(screen.getByLabelText(/Kurum ya da etkinlik adı/), 'Örnek A.Ş.');
  await user.type(screen.getByLabelText(/^Yıl/), '2025');
  await user.selectOptions(screen.getByLabelText(/^Dönem/), 'SUMMER');
  await user.type(screen.getByLabelText(/Süre/), '8');
  await user.selectOptions(screen.getByLabelText(/^Ücret/), 'PAID');
  await user.selectOptions(screen.getByLabelText(/Nasıl başvurdun/), 'LINKEDIN_POST');
  await user.type(screen.getByLabelText(/Neler öğrendin/), 'Çok şey öğrendim.');
  await user.type(screen.getByLabelText(/Sonrakilere tavsiyen/), 'Erken başvur.');
}

describe('deneyim formu', () => {
  it('tür değişince sorulan alanlar değişir (D9)', async () => {
    const { user } = setup();
    expect(screen.getByLabelText(/^Ücret/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nasıl başvurdun/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Deneyim türü/), 'CERTIFICATE');
    expect(screen.queryByLabelText(/^Ücret/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Nasıl başvurdun/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Neler öğrendin/)).toBeInTheDocument();
  });

  it('doldurulmuş alan yeni türde sorulmuyorsa kullanıcıya söylenir ve içeriğe girmez', async () => {
    const { user, save } = setup();
    await user.type(screen.getByLabelText(/^Ülke/), 'Almanya');
    await user.selectOptions(screen.getByLabelText(/Deneyim türü/), 'CERTIFICATE');
    expect(screen.getByText(/bu türde sorulmayan alanlar kaydedilmez/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Kurum ya da etkinlik adı/), 'Kurs');
    await user.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    const sent = save.mock.calls[0]![0];
    expect(sent.content).toEqual({ type: 'CERTIFICATE', organizationName: 'Kurs' });
  });

  it('boş gönderimde alan bazlı hata verir, ilk hatalı alana odaklanır ve sunucuyu çağırmaz', async () => {
    const { user, save, submit } = setup();
    await user.click(screen.getByRole('button', { name: 'Moderasyona gönder' }));
    expect(save).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    const field = screen.getByLabelText(/Kurum ya da etkinlik adı/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
    expect(screen.getAllByText('Bu alan zorunlu.').length).toBeGreaterThan(3);
  });

  it('yazmaya başlayınca o alanın hatası kalkar', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Moderasyona gönder' }));
    const field = screen.getByLabelText(/Kurum ya da etkinlik adı/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await user.type(field, 'A');
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('taslak boşken de kaydedilir; anonim seçimi sunucuya gider', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('radio', { name: /Anonim paylaş/ }));
    await user.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    expect(save).toHaveBeenCalledWith({
      departmentId: 'd1',
      content: { type: 'INTERNSHIP', processSteps: [], interviewQuestions: [] },
      isAnonymous: true,
    });
    expect(await screen.findByText('Taslak kaydedildi.')).toBeInTheDocument();
  });

  it('geçerli içerik onay penceresinden sonra kaydedilir ve gönderilir; sonraki kayıt aynı kaydı günceller', async () => {
    const { user, save, submit } = setup();
    await fillInternship(user);
    await user.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    await screen.findByText('Taslak kaydedildi.');
    expect(save.mock.calls[0]![0]).not.toHaveProperty('experienceId');
    await user.click(screen.getByRole('button', { name: 'Moderasyona gönder' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('İncelemeye gönderilsin mi?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Moderasyona gönder' }));
    expect(
      await screen.findByRole('heading', { name: 'Deneyimin incelemeye gönderildi.' }),
    ).toBeInTheDocument();
    expect(save.mock.calls[1]![0]).toMatchObject({ experienceId: 'e1' });
    expect(submit).toHaveBeenCalledWith({ experienceId: 'e1' });
  });

  it('sunucu hatasını katalogdaki metne çevirir, ham kodu göstermez', async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, errorCode: 'RATE_LIMITED' });
    const { user } = setup({ save: save as never });
    await user.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('RATE_LIMITED');
    expect(alert).toHaveTextContent('Çok fazla deneme');
  });

  it('düzenlemede bölüm sabittir; reddedilen deneyimin gerekçesi üstte görünür', () => {
    setup({
      initial: {
        id: 'e1',
        departmentId: 'd1',
        state: emptyState('ERASMUS'),
        isAnonymous: true,
        moderationNote: 'Süreç adımları eksik.',
      },
    });
    expect(screen.getByText('Süreç adımları eksik.')).toBeInTheDocument();
    expect(screen.getByText(/Yazıldığı bölüm sonradan değişmez/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Anonim paylaş/ })).toBeChecked();
  });

  it('süreç adımı ve soru satırı eklenip silinir', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Adım ekle' }));
    expect(screen.getByLabelText(/Adım başlığı/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Adımı sil' }));
    expect(screen.queryByLabelText(/Adım başlığı/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Soru ekle' }));
    expect(screen.getByLabelText('1. soru')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Soruyu sil' }));
    expect(screen.queryByLabelText('1. soru')).not.toBeInTheDocument();
  });
});

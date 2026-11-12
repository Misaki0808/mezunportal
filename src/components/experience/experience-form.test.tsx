// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToasts } from '@/test/render';

import { ExperienceForm } from './experience-form';
import { emptyState } from './form-state';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

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
  const view = renderWithToasts(
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
  it('taslağı çift kaydetme tek istektir; hata veriyi korur', async () => {
    const gate = Promise.withResolvers<never>();
    const save = vi.fn(() => gate.promise);
    const { user } = setup({ save });
    const organization = screen.getByLabelText(/Kurum ya da etkinlik adı/);
    await user.type(organization, 'Korunan kurum');
    const button = screen.getByRole('button', { name: 'Taslağı kaydet' });
    act(() => {
      button.click();
      button.click();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => gate.reject(new Error('ağ')));
    expect(organization).toHaveValue('Korunan kurum');
    expect(await screen.findByText(/Beklenmeyen bir sorun/)).toBeVisible();
  });
  it('deneyimi çift gönderme tek kayıttır; hata alanları korur', async () => {
    const gate = Promise.withResolvers<never>();
    const save = vi.fn(() => gate.promise);
    const { user } = setup({ save });
    await fillInternship(user);
    await user.click(screen.getByRole('button', { name: 'Moderasyona gönder' }));
    const button = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Moderasyona gönder',
    });
    act(() => {
      button.click();
      button.click();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => gate.reject(new Error('ağ')));
    expect(screen.getByLabelText(/Kurum ya da etkinlik adı/)).toHaveValue('Örnek A.Ş.');
    expect(await screen.findByText(/Beklenmeyen bir sorun/)).toBeVisible();
  });
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

  it('genel hata özeti renge atıf yapmaz ve "İlk sorunlu alana git" odağı taşır', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Moderasyona gönder' }));
    const alert = screen.getByText('Hatalı alanları düzeltip tekrar dene.');
    expect(alert).toBeVisible();
    expect(screen.queryByText(/kırmızı/i)).not.toBeInTheDocument();
    const field = screen.getByLabelText(/Kurum ya da etkinlik adı/);
    expect(field).toHaveFocus();
    field.blur();
    expect(field).not.toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'İlk sorunlu alana git' }));
    expect(field).toHaveFocus();
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
      appliedMonth: null,
      content: { type: 'INTERNSHIP', processSteps: [], interviewQuestions: [] },
      isAnonymous: true,
    });
    expect(await screen.findByText('Taslağın kaydedildi.')).toBeInTheDocument();
  });
  it('başvuru ayı yalnız özel kaydetme alanında gönderilir', async () => {
    const { user, save } = setup();
    await user.selectOptions(screen.getByLabelText('Başvuru ayı (isteğe bağlı)'), '3');
    await user.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    expect(save.mock.calls[0]![0]).toMatchObject({ appliedMonth: 3 });
    expect(save.mock.calls[0]![0].content).not.toHaveProperty('appliedMonth');
  });

  it('geçerli içerik onay penceresinden sonra kaydedilir ve gönderilir; sonraki kayıt aynı kaydı günceller', async () => {
    const { user, save, submit } = setup();
    await fillInternship(user);
    await user.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    await screen.findByText('Taslağın kaydedildi.');
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
    // ToastProvider kalıcı bir alert bölgesi taşır: hata metni metinle sorgulanır.
    const alert = (await screen.findByText(/Çok fazla deneme/)).closest('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert).not.toHaveTextContent('RATE_LIMITED');
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

describe('deneyim formu: adım hissi', () => {
  it('bölümler numaralı kartlardır ve ilerleme şeridi ilk eksik bölümü gösterir', async () => {
    const { user } = setup();
    // Bölüm tek seçenek olduğu için "Başlangıç" tamam; ilk eksik bölüm "Genel bilgi".
    expect(screen.getByText('Adım 2 / 5: Genel bilgi')).toBeInTheDocument();
    for (const name of ['Başlangıç', 'Genel bilgi', 'Başvuru süreci', 'Deneyimin', 'Görünürlük']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    await fillInternship(user);
    // Zorunlu alanlar dolunca şerit son adıma (gönderimden önce görünürlük) geçer.
    expect(screen.getByText('Adım 5 / 5: Görünürlük')).toBeInTheDocument();
  });

  it('alan ipuçları kısa ve sıcaktır; ücret alanı tutar istemediğini söyler', () => {
    setup();
    expect(screen.getByLabelText(/^Ücret/)).toHaveAccessibleDescription(/Tutar yazman gerekmiyor/);
    expect(screen.getByLabelText(/^Ülke/)).toHaveAccessibleDescription('İsteğe bağlı.');
  });
});

describe('deneyim formu: kaydedilmemiş değişiklik uyarısı', () => {
  beforeEach(() => {
    router.push.mockClear();
  });

  const closing = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  /** Sayfadaki uygulama içi bağlantıyı taklit eder (gerçek sayfada üst çubuk/menü bağlantıları). */
  const pageLink = () => {
    const link = document.createElement('a');
    link.href = '/hesap';
    link.textContent = 'Hesabım';
    document.body.append(link);
    return link;
  };

  it('dokunulmamış formda sekme kapatılırken uyarı çıkmaz', () => {
    setup();
    expect(closing()).toBe(false);
  });

  it('yazıldıktan sonra sekme kapatma sorulur; yazılan silinip eski hale gelirse sorulmaz', async () => {
    const { user } = setup();
    const field = screen.getByLabelText(/Kurum ya da etkinlik adı/);
    await user.type(field, 'Taslak');
    expect(closing()).toBe(true);
    await user.clear(field);
    expect(closing()).toBe(false);
  });

  it('taslak kaydedilince uyarı kalkar, sonraki değişiklikte yeniden başlar', async () => {
    const { user } = setup();
    const field = screen.getByLabelText(/Kurum ya da etkinlik adı/);
    await user.type(field, 'Taslak');
    await user.click(screen.getByRole('button', { name: 'Taslağı kaydet' }));
    await screen.findByRole('button', { name: 'Taslağı kaydet' });
    expect(closing()).toBe(false);
    await user.type(field, ' devam');
    expect(closing()).toBe(true);
  });

  it('kaydedilmemiş değişiklikle uygulama içi bağlantıya basınca sorulur; "Burada kal" gezinmeyi iptal eder', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(/Kurum ya da etkinlik adı/), 'Taslak');
    const link = pageLink();
    await user.click(link);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Kaydedilmemiş değişikliklerin var')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Burada kal' }));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Kurum ya da etkinlik adı/)).toHaveValue('Taslak');
    link.remove();
  });

  it('"Kaydetmeden çık" kaydetmeden gider; "Taslağı kaydet ve çık" önce kaydeder, sonra gider', async () => {
    const first = setup();
    await first.user.type(screen.getByLabelText(/Kurum ya da etkinlik adı/), 'Taslak');
    const link = pageLink();
    await first.user.click(link);
    await first.user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kaydetmeden çık' }),
    );
    expect(first.save).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/hesap');
    first.unmount();
    router.push.mockClear();

    const second = setup();
    await second.user.type(screen.getByLabelText(/Kurum ya da etkinlik adı/), 'Taslak');
    await second.user.click(link);
    await second.user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Taslağı kaydet ve çık',
      }),
    );
    expect(second.save).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/hesap'));
    link.remove();
  });

  it('kayıt başarısızsa "kaydet ve çık" gitmez; hata görünür ve yazılan korunur', async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, errorCode: 'RATE_LIMITED' });
    const { user } = setup({ save: save as never });
    await user.type(screen.getByLabelText(/Kurum ya da etkinlik adı/), 'Taslak');
    const link = pageLink();
    await user.click(link);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Taslağı kaydet ve çık',
      }),
    );
    expect(await screen.findByText(/Çok fazla deneme/)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Kurum ya da etkinlik adı/)).toHaveValue('Taslak');
    link.remove();
  });

  it('dokunulmamış formda bağlantı engellenmez', async () => {
    const { user } = setup();
    const link = pageLink();
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    link.remove();
  });
});

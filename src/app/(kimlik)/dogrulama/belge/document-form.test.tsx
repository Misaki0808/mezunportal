// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { DocumentForm } from './document-form';

const departments = [
  {
    id: 'ybs',
    name: 'Yönetim Bilişim Sistemleri',
    facultyName: 'Fakülte',
    universityName: 'Üniversite',
  },
];

describe('DocumentForm', () => {
  it('PDF dışı dosyayı alanda reddeder ve eylemi çağırmaz', async () => {
    const submit = vi.fn();
    const { user } = renderUi(<DocumentForm departments={departments} submit={submit} />);
    await user.selectOptions(screen.getByLabelText(/Bölüm/), 'ybs');
    await user.type(screen.getByLabelText(/Mezuniyet yılı/), '2024');
    await user.upload(
      screen.getByLabelText(/Mezun belgesi/),
      new File(['metin'], 'belge.pdf', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Belgeyi gönder' }));
    expect(screen.getByText('Yalnız PDF dosyası yükleyebilirsin.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
  it('dosya seçmeden gönderince "Bir PDF dosyası seç." der (boş dosya metni değil) ve eylemi çağırmaz', async () => {
    const submit = vi.fn();
    const { user } = renderUi(<DocumentForm departments={departments} submit={submit} />);
    await user.selectOptions(screen.getByLabelText(/Bölüm/), 'ybs');
    await user.type(screen.getByLabelText(/Mezuniyet yılı/), '2024');
    await user.click(screen.getByRole('button', { name: 'Belgeyi gönder' }));
    expect(screen.getByText('Bir PDF dosyası seç.')).toBeInTheDocument();
    expect(screen.queryByText('Seçtiğin dosya boş.')).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
  it('5 MB üstündeki PDF dosyasını reddeder', async () => {
    const submit = vi.fn();
    const { user } = renderUi(<DocumentForm departments={departments} submit={submit} />);
    await user.selectOptions(screen.getByLabelText(/Bölüm/), 'ybs');
    await user.type(screen.getByLabelText(/Mezuniyet yılı/), '2024');
    await user.upload(
      screen.getByLabelText(/Mezun belgesi/),
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'belge.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: 'Belgeyi gönder' }));
    expect(screen.getByText('Dosya en fazla 5 MB olabilir.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
  it('uygun PDF için belgeyi bir kez gönderir ve durum bağlantısını gösterir', async () => {
    const submit = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { documentId: 'ornek', status: 'PENDING' } });
    const { user } = renderUi(<DocumentForm departments={departments} submit={submit} />);
    await user.selectOptions(screen.getByLabelText(/Bölüm/), 'ybs');
    await user.type(screen.getByLabelText(/Mezuniyet yılı/), '2024');
    await user.upload(
      screen.getByLabelText(/Mezun belgesi/),
      new File(['%PDF-ornek'], 'ornek.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: 'Belgeyi gönder' }));
    // Form kalkar; odak BODY'ye düşmez, sonuç metnine gider (klavye/ekran okuyucu yerini kaybetmez).
    expect(await screen.findByText('Belgen incelemeye gönderildi.')).toHaveFocus();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Doğrulama durumunu gör' })).toHaveAttribute(
      'href',
      '/dogrulama',
    );
  });
  it('boş gönderimde odak ilk hatalı alana gider ve ileti alana bağlıdır', async () => {
    const submit = vi.fn();
    const { user } = renderUi(<DocumentForm departments={departments} submit={submit} />);
    await user.click(screen.getByRole('button', { name: 'Belgeyi gönder' }));
    const department = screen.getByLabelText(/Bölüm/);
    expect(department).toHaveFocus();
    expect(department).toHaveAttribute('aria-invalid', 'true');
    expect(department).toHaveAccessibleDescription('Bölümünü listeden seç.');
    expect(screen.getByLabelText(/Mezuniyet yılı/)).toHaveAccessibleDescription(
      '1950 ile gelecek yıl arasında bir mezuniyet yılı yaz.',
    );
    expect(screen.getByText('Bir PDF dosyası seç.')).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });
  it('bölüm seçilince ikinci gönderimde odak sıradaki hatalı alana geçer', async () => {
    const { user } = renderUi(<DocumentForm departments={departments} submit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Belgeyi gönder' }));
    await user.selectOptions(screen.getByLabelText(/Bölüm/), 'ybs');
    await user.click(screen.getByRole('button', { name: 'Belgeyi gönder' }));
    expect(screen.getByLabelText(/Mezuniyet yılı/)).toHaveFocus();
  });
  it('sunucu alan hatasında da odak hatalı alana gider', async () => {
    const submit = vi.fn().mockResolvedValue({
      ok: false,
      errorCode: 'VALIDATION_INVALID',
      fieldErrors: { graduationYear: 'VALIDATION_INVALID' },
    });
    const { user } = renderUi(<DocumentForm departments={departments} submit={submit} />);
    await user.selectOptions(screen.getByLabelText(/Bölüm/), 'ybs');
    await user.type(screen.getByLabelText(/Mezuniyet yılı/), '2024');
    await user.upload(
      screen.getByLabelText(/Mezun belgesi/),
      new File(['%PDF-ornek'], 'ornek.pdf', { type: 'application/pdf' }),
    );
    await user.click(screen.getByRole('button', { name: 'Belgeyi gönder' }));
    await waitFor(() => expect(screen.getByLabelText(/Mezuniyet yılı/)).toHaveFocus());
  });
});

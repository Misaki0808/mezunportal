// @vitest-environment jsdom
import { screen } from '@testing-library/react';
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
    expect(await screen.findByRole('status')).toHaveTextContent('Belgen incelemeye gönderildi.');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Doğrulama durumunu gör' })).toHaveAttribute(
      'href',
      '/dogrulama',
    );
  });
});

// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { Invitations } from './invitations';

vi.mock('@/server/actions/invitations', () => ({ sendInvitations: vi.fn() }));

const csv = (bytes: number, name = 'liste.csv') =>
  new File([new Uint8Array(bytes).fill(97)], name, { type: 'text/csv' });

describe('Toplu davet', () => {
  it('30 KB üstü dosya reddedilir: hata dosya alanına bağlı, ad gösterilmez, metin alanı değişmez', async () => {
    const { user } = renderUi(<Invitations />);
    const input = screen.getByLabelText('CSV veya metin dosyası yükle');

    await user.upload(input, csv(30001));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Dosya çok büyük. En fazla 30 KB yükleyebilirsin.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
    expect(screen.queryByText('liste.csv')).not.toBeInTheDocument();
    expect(screen.getByText('Henüz dosya seçilmedi')).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta adresleri')).toHaveValue('');
  });

  it('uygun dosya seçilince hata kalkar, ad görünür ve metin alanı dolar', async () => {
    const { user } = renderUi(<Invitations />);
    const input = screen.getByLabelText('CSV veya metin dosyası yükle');
    await user.upload(input, csv(30001));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.upload(input, csv(20, 'kucuk.csv'));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('kucuk.csv')).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta adresleri')).toHaveValue('a'.repeat(20));
  });
});

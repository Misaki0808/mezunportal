// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderUi } from '@/test/render';

import { Field, FieldAnnounceContext } from './field';
import { Input } from './input';

describe('Field', () => {
  it('etiketi kontrole bağlar (etiketle bulunur, placeholder gerekmez)', () => {
    renderUi(<Field label="Ad soyad">{(control) => <Input {...control} />}</Field>);

    const input = screen.getByLabelText('Ad soyad');
    expect(input.tagName).toBe('INPUT');
  });

  it('hatayı alanın altında gösterir, aria-describedby ve aria-invalid ile bağlar', () => {
    renderUi(
      <Field label="E-posta" hint="Okul adresin" error="Geçerli bir e-posta yaz.">
        {(control) => <Input {...control} />}
      </Field>,
    );

    const input = screen.getByLabelText('E-posta');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Geçerli bir e-posta yaz.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
    const hint = screen.getByText('Okul adresin');
    expect(input.getAttribute('aria-describedby')).toContain(hint.id);
    expect(input).toHaveAccessibleDescription('Okul adresin Geçerli bir e-posta yaz.');
    expect(input.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hint.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hata yokken aria-invalid ve hata öğesi yoktur', () => {
    renderUi(<Field label="Ad">{(control) => <Input {...control} />}</Field>);

    expect(screen.getByLabelText('Ad')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('zorunlu alanı ekran okuyucuya “zorunlu” olarak bildirir', () => {
    renderUi(
      <Field label="Ad" required>
        {(control) => <Input {...control} />}
      </Field>,
    );

    expect(screen.getByLabelText(/Ad/)).toBeRequired();
    expect(screen.getByText('(zorunlu)')).toBeInTheDocument();
  });

  it('“i” düğmesi açıklamayı açar/kapatır ve aria-expanded ile bağlıdır', async () => {
    const { user } = renderUi(
      <Field label="Ad" hint="Kısa ipucu" help="Uzun açıklama metni">
        {(control) => <Input {...control} />}
      </Field>,
    );

    const toggle = screen.getByRole('button', { name: 'Açıklamayı göster ya da gizle' });
    const help = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(help).toHaveAttribute('hidden');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(help).not.toHaveAttribute('hidden');
    const input = screen.getByLabelText('Ad');
    expect(input.getAttribute('aria-describedby')).toContain(help?.id);
    expect(input).toHaveAccessibleDescription('Kısa ipucu Uzun açıklama metni');

    await user.click(toggle);
    expect(help).toHaveAttribute('hidden');
    expect(input).toHaveAccessibleDescription('Kısa ipucu');
  });

  it('duyuru bağlamı kapalıysa hata metni görünür ve alana bağlı kalır ama kendi başına duyurulmaz', () => {
    renderUi(
      <FieldAnnounceContext.Provider value={false}>
        <Field label="Şehir" error="Bu alan zorunlu.">
          {(control) => <Input {...control} />}
        </Field>
      </FieldAnnounceContext.Provider>,
    );
    const input = screen.getByLabelText('Şehir');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Bu alan zorunlu.');
  });
});

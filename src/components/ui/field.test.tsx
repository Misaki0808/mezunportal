// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderUi } from '@/test/render';

import { Field } from './field';
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
    expect(input.getAttribute('aria-describedby')).toContain(screen.getByText('Okul adresin').id);
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
      <Field label="Ad" help="Uzun açıklama metni">
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
    expect(screen.getByLabelText('Ad').getAttribute('aria-describedby')).toContain(help?.id);

    await user.click(toggle);
    expect(help).toHaveAttribute('hidden');
  });
});

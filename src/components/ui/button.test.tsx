// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { Button } from './button';
import { IconButton } from './icon-button';

describe('Button', () => {
  it('varsayılan type="button" (formu kazara göndermez)', () => {
    renderUi(<Button>Kaydet</Button>);
    expect(screen.getByRole('button', { name: 'Kaydet' })).toHaveAttribute('type', 'button');
  });

  it('danger-outline: yıkıcı ikincil eylem tehlike renginde çerçeveli, dolgusuz', () => {
    renderUi(<Button variant="danger-outline">Sil</Button>);
    const button = screen.getByRole('button', { name: 'Sil' });
    expect(button).toHaveClass('border-danger', 'text-danger');
    expect(button).not.toHaveClass('bg-danger');
  });

  it('devre dışı düğme sebebini görünür yazar ve aria-describedby ile bağlar', () => {
    renderUi(
      <Button disabled disabledReason="Bu ay kapasite doldu">
        Randevu al
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Randevu al' });
    expect(button).toBeDisabled();
    const reason = screen.getByText('Bu ay kapasite doldu');
    expect(reason).toBeVisible();
    expect(button.getAttribute('aria-describedby')).toBe(reason.id);
  });

  it('yükleniyorken ikinci tıklamayı yutar ve durumu duyurur', async () => {
    const onClick = vi.fn();
    const { user } = renderUi(
      <Button loading onClick={onClick}>
        Gönder
      </Button>,
    );

    const button = screen.getByRole('button', { name: /Gönder/ });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Yükleniyor')).toBeInTheDocument();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('normal durumda tıklama çalışır', async () => {
    const onClick = vi.fn();
    const { user } = renderUi(<Button onClick={onClick}>Kaydet</Button>);

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('IconButton', () => {
  it('erişilebilir adını label’dan alır', () => {
    renderUi(<IconButton label="Bildirimleri aç" icon={<svg aria-hidden="true" />} />);
    expect(screen.getByRole('button', { name: 'Bildirimleri aç' })).toBeInTheDocument();
  });
});

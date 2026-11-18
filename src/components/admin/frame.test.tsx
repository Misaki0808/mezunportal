// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import messages from '../../../messages/tr.json';
import { renderUi } from '@/test/render';
import { AdminFrame } from './frame';

it('ayrıntı sayfası kendi listesine döner: verilen adres ve ad kullanılır', () => {
  renderUi(
    <AdminFrame title="Başlık" backHref="/yonetim/kullanicilar" backLabel="Kullanıcılara dön">
      İçerik
    </AdminFrame>,
  );
  expect(screen.getByRole('link', { name: 'Kullanıcılara dön' })).toHaveAttribute(
    'href',
    '/yonetim/kullanicilar',
  );
  expect(screen.queryByRole('link', { name: messages.admin.back })).not.toBeInTheDocument();
});
it('yönetim çerçevesi ortak geri bağlantısıyla yönetim ana sayfasına döner', () => {
  renderUi(<AdminFrame title="Başlık">İçerik</AdminFrame>);
  const link = screen.getByRole('link', { name: messages.admin.back });
  expect(link).toHaveAttribute('href', '/yonetim');
  expect(link).toHaveClass('min-h-11');
  expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});

// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import messages from '../../../messages/tr.json';
import { renderUi } from '@/test/render';
import { AdminFrame } from './frame';

it('yönetim çerçevesi ortak geri bağlantısıyla yönetim ana sayfasına döner', () => {
  renderUi(<AdminFrame title="Başlık">İçerik</AdminFrame>);
  const link = screen.getByRole('link', { name: messages.admin.back });
  expect(link).toHaveAttribute('href', '/yonetim');
  expect(link).toHaveClass('min-h-11');
  expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});

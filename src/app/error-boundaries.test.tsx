// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import messages from '../../messages/tr.json';
import ErrorPage from './error';
import GlobalError from './global-error';

const error = new Error('private transport details');

it('sayfa hatası kabuğun ana bölgesini korur; Türkçe yeniden deneme çalışır', async () => {
  const reset = vi.fn();
  const { user } = renderUi(
    <main>
      <ErrorPage error={error} reset={reset} />
    </main>,
  );
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: messages.errorBoundary.title })).toBeVisible();
  expect(screen.queryByText(error.message)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: messages.errorBoundary.retry }));
  expect(reset).toHaveBeenCalledOnce();
  expect(screen.getByRole('link', { name: messages.errorBoundary.home })).toHaveAttribute(
    'href',
    '/',
  );
});

it('kök hata sağlayıcı olmadan Türkçe belge, marka ve geri dönüş bağlantısı sunar', () => {
  const markup = renderToStaticMarkup(<GlobalError error={error} reset={vi.fn()} />);
  const document = new DOMParser().parseFromString(markup, 'text/html');
  expect(document.documentElement.lang).toBe('tr');
  expect(document.querySelectorAll('main')).toHaveLength(1);
  expect(document.querySelector('header svg')).not.toBeNull();
  expect(document.querySelector('header a')?.getAttribute('aria-label')).toBe(messages.nav.brand);
  expect(document.querySelector('main button')?.textContent).toBe(messages.errorBoundary.retry);
  expect(document.querySelector('main a')?.getAttribute('href')).toBe('/');
  expect(document.body.textContent).not.toContain(error.message);
});

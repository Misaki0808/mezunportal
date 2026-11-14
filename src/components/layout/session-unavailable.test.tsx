// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { SessionUnavailable } from './session-unavailable';

vi.mock('next/navigation', () => ({ usePathname: () => '/profil' }));

it('marka, geçici hata ve klavyeyle ulaşılabilir yeniden deneme gösterir', () => {
  renderUi(<SessionUnavailable />);
  expect(screen.getByRole('img', { name: 'MezunPortal' })).toBeVisible();
  expect(screen.getByText('Beklenmeyen bir sorun oluştu. Biraz sonra tekrar dene.')).toBeVisible();
  const button = screen.getByRole('button', { name: 'Yeniden dene' });
  button.focus();
  expect(button).toHaveFocus();
});

it('yeniden dene düğmesi mevcut sayfayı yeniler', async () => {
  const reload = vi.fn();
  const actual = window;
  const proxy = new Proxy(actual, {
    get(target, property, receiver) {
      if (property === 'location') return { reload };
      return Reflect.get(target, property, receiver);
    },
  });
  vi.stubGlobal('window', proxy);
  try {
    const { user } = renderUi(<SessionUnavailable />);
    await user.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    expect(reload).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

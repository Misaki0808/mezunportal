// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderUi } from '@/test/render';

import { rememberSignInAddress } from '../sign-in-address';
import { SentAddress } from './sent-address';

beforeEach(() => window.sessionStorage.clear());

it('bu sekmede istenen adresi olduğu gibi (maskesiz) gösterir: yanlış yazdıysa kullanıcı fark etsin', () => {
  rememberSignInAddress('ayse.yilmaz@ogr.iu.edu.tr');
  renderUi(<SentAddress />);
  expect(screen.getByText('Bağlantıyı şu adrese gönderdik:', { exact: false })).toBeVisible();
  expect(screen.getByText('ayse.yilmaz@ogr.iu.edu.tr')).toBeVisible();
});

it('adres belleğe hiç yazılmadıysa (sayfa doğrudan açıldı) hiçbir şey çizmez ve hata vermez', () => {
  const { container } = renderUi(<SentAddress />);
  expect(container).toBeEmptyDOMElement();
});

it('bellek erişimi hata verirse (özel pencere) hiçbir şey çizmez', () => {
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  try {
    const { container } = renderUi(<SentAddress />);
    expect(container).toBeEmptyDOMElement();
  } finally {
    spy.mockRestore();
  }
});

it('adresi HTML olarak yorumlamaz: metin olarak çizer', () => {
  rememberSignInAddress('<img src=x onerror=alert(1)>@example.test');
  const { container } = renderUi(<SentAddress />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('<img src=x onerror=alert(1)>@example.test')).toBeVisible();
});

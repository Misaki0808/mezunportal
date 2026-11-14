// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';

import { forgetSignInAddress, readSignInAddress, rememberSignInAddress } from './sign-in-address';

const LIMIT = 254; // e-posta adresinin standart üst sınırı (RFC 5321)
const KEY = 'mezun.signin.address';
const raw = () => window.sessionStorage.getItem(KEY);

beforeEach(() => window.sessionStorage.clear());

it('adres en çok 254 karakter saklanır: tam sınırda aynen, bir fazlasında kesilir (yazarken)', () => {
  const exact = `${'a'.repeat(LIMIT - 8)}@ex.test`;
  expect(exact).toHaveLength(LIMIT);
  rememberSignInAddress(exact);
  expect(raw()).toBe(exact);
  expect(readSignInAddress()).toBe(exact);

  rememberSignInAddress(`${exact}x`);
  expect(raw()).toHaveLength(LIMIT);
  expect(readSignInAddress()).toBe(exact);
});

it('çok uzun girdi bellekte de ekranda da 254 karakterde kesilir', () => {
  rememberSignInAddress('b'.repeat(2540));
  expect(raw()).toHaveLength(LIMIT);
  expect(readSignInAddress()).toHaveLength(LIMIT);
});

it('okurken de kesilir: bellekte başkası ya da eski sürüm daha uzun bir değer bıraktıysa ekran taşmaz', () => {
  window.sessionStorage.setItem(KEY, 'c'.repeat(2540));
  expect(readSignInAddress()).toHaveLength(LIMIT);
});

it('boş ya da silinmiş adres null döner', () => {
  expect(readSignInAddress()).toBeNull();
  rememberSignInAddress('ayse@ogr.iu.edu.tr');
  forgetSignInAddress();
  expect(readSignInAddress()).toBeNull();
});

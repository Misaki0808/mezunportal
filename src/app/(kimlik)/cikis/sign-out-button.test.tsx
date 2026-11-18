// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { readSignInAddress, rememberSignInAddress } from '@/lib/sign-in-address';
import { renderUi } from '@/test/render';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { SignOutButton } from './sign-out-button';

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
});

it('çıkış başarılı olunca giriş sayfasına döner ve kontrol ekranı için tutulan adres silinir (ortak bilgisayar)', async () => {
  rememberSignInAddress('ayse@ogr.iu.edu.tr');
  const submit = vi.fn().mockResolvedValue({ ok: true, data: { signedOut: true } });
  const { user } = renderUi(<SignOutButton submit={submit} />);
  await user.click(screen.getByRole('button', { name: 'Çıkış yap' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/giris'));
  expect(readSignInAddress()).toBeNull();
});

it('çıkış başarılı olunca bu sekmedeki bütün CV karar kayıtları silinir, başkaları kalır', async () => {
  window.sessionStorage.setItem('mezun.cv.decisions.cv1', '{"k-edu":"accept"}');
  window.sessionStorage.setItem('mezun.cv.decisions.cv2', '{"k-pos":"reject"}');
  window.sessionStorage.setItem('baska.anahtar', 'kalir');
  const submit = vi.fn().mockResolvedValue({ ok: true, data: { signedOut: true } });
  const { user } = renderUi(<SignOutButton submit={submit} />);
  await user.click(screen.getByRole('button', { name: 'Çıkış yap' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/giris'));
  expect(window.sessionStorage.getItem('mezun.cv.decisions.cv1')).toBeNull();
  expect(window.sessionStorage.getItem('mezun.cv.decisions.cv2')).toBeNull();
  expect(window.sessionStorage.getItem('baska.anahtar')).toBe('kalir');
});

it('depolama hata verse bile çıkış tamamlanır', async () => {
  const submit = vi.fn().mockResolvedValue({ ok: true, data: { signedOut: true } });
  const spy = vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
    throw new Error('depolama kapalı');
  });
  const { user } = renderUi(<SignOutButton submit={submit} />);
  await user.click(screen.getByRole('button', { name: 'Çıkış yap' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/giris'));
  spy.mockRestore();
});

it('çıkış başarısızsa adrese ve CV kararlarına dokunulmaz, hata gösterilir', async () => {
  window.sessionStorage.setItem('mezun.cv.decisions.cv1', '{"k-edu":"accept"}');
  rememberSignInAddress('ayse@ogr.iu.edu.tr');
  const submit = vi.fn().mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  const { user } = renderUi(<SignOutButton submit={submit} />);
  await user.click(screen.getByRole('button', { name: 'Çıkış yap' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(readSignInAddress()).toBe('ayse@ogr.iu.edu.tr');
  expect(window.sessionStorage.getItem('mezun.cv.decisions.cv1')).not.toBeNull();
  expect(router.replace).not.toHaveBeenCalled();
});

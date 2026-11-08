import { beforeEach, expect, it, vi } from 'vitest';
const { state, path } = vi.hoisted(() => ({
  state: vi.fn(),
  path: { value: '/hesap' as string | null },
}));
vi.mock('@/server/actions/privacy', () => ({ getConsentState: state }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(path.value === null ? {} : { 'x-mezun-path': path.value }),
}));
vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    throw new Error(`redirect:${target}`);
  },
}));
import { PrivacyGuard } from './server-guard';

beforeEach(() => {
  path.value = '/hesap';
});

it('yeniden onayı sunucu sonucundan uygular, istemcide rıza kuralı türetmez; dönüş yolunu taşır', async () => {
  state.mockResolvedValue({ ok: true, data: { blocking: true } });
  await expect(PrivacyGuard({ children: 'korumalı' })).rejects.toThrow(
    'redirect:/onay?donus=%2Fhesap',
  );
  state.mockResolvedValue({ ok: true, data: { blocking: false } });
  expect(await PrivacyGuard({ children: 'korumalı' })).toBe('korumalı');
});

it('oturumsuz kullanıcı hata ekranı değil girişe yönlenir (dönüş yoluyla)', async () => {
  state.mockResolvedValue({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
  path.value = '/hesap/gizlilik?x=1';
  await expect(PrivacyGuard({ children: 'korumalı' })).rejects.toThrow(
    'redirect:/giris?donus=%2Fhesap%2Fgizlilik%3Fx%3D1',
  );
});

it('güvensiz ya da eksik yol başlığında dönüş parametresi eklenmez (açık yönlendirme yok)', async () => {
  state.mockResolvedValue({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
  for (const value of ['//kotu.example', 'https://kotu.example', null]) {
    path.value = value;
    await expect(PrivacyGuard({ children: 'korumalı' })).rejects.toThrow('redirect:/giris');
    await expect(PrivacyGuard({ children: 'korumalı' })).rejects.not.toThrow('donus');
  }
});

it('askıdaki hesap girişe değil hata ekranına düşer', async () => {
  state.mockResolvedValue({ ok: false, errorCode: 'AUTH_ACCOUNT_SUSPENDED' });
  const result = await PrivacyGuard({ children: 'korumalı' });
  expect(result).not.toBe('korumalı');
});

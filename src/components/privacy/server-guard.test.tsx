import { expect, it, vi } from 'vitest';
const { state } = vi.hoisted(() => ({ state: vi.fn() }));
vi.mock('@/server/actions/privacy', () => ({ getConsentState: state }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
import { PrivacyGuard } from './server-guard';
it('yeniden onayı sunucu sonucundan uygular, istemcide rıza kuralı türetmez', async () => {
  state.mockResolvedValue({ ok: true, data: { blocking: true } });
  await expect(PrivacyGuard({ children: 'korumalı' })).rejects.toThrow('redirect:/onay');
  state.mockResolvedValue({ ok: true, data: { blocking: false } });
  expect(await PrivacyGuard({ children: 'korumalı' })).toBe('korumalı');
});

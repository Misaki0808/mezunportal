// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import { NotificationPreferencesForm } from './preferences-form';

describe('bildirim tercih ekranı', () => {
  const initial = {
    items: [
      { type: 'ACCOUNT_SECURITY' as const, enabled: true, mandatory: true },
      { type: 'CONTACT_REQUEST' as const, enabled: true, mandatory: false },
    ],
  };
  it('güvenlik bildirimi kapatılamaz ve nedeni görünür', () => {
    renderUi(<NotificationPreferencesForm initial={initial} save={vi.fn()} />);
    expect(screen.getByRole('switch', { name: /Hesap ve güvenlik/ })).toBeDisabled();
    expect(screen.getByText('Hesap güvenliği için bu bildirim kapatılamaz.')).toBeVisible();
  });
  it('değişikliği kaydetmeden göndermez; kapalı tercihi açıkça iletir', async () => {
    const save = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        data: { items: [initial.items[0], { ...initial.items[1], enabled: false }] },
      });
    const { user } = renderUi(<NotificationPreferencesForm initial={initial} save={save} />);
    await user.click(screen.getByRole('switch', { name: /İletişim talepleri/ }));
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Tercihleri kaydet' }));
    expect(save).toHaveBeenCalledWith({
      items: [
        { type: 'ACCOUNT_SECURITY', enabled: true },
        { type: 'CONTACT_REQUEST', enabled: false },
      ],
    });
    expect(await screen.findByText('Bildirim tercihlerin kaydedildi.')).toBeVisible();
  });
});

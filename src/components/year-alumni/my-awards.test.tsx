// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../messages/tr.json';
import type { MyAward } from '@/contracts/year-alumni';
import { renderWithToasts } from '@/test/render';

const mocks = vi.hoisted(() => ({ setPublication: vi.fn() }));
vi.mock('@/server/actions/year-alumni', () => ({ setAwardPublication: mocks.setPublication }));

import { MyAwards } from './my-awards';

const award: MyAward = {
  id: 'odul-1',
  department: 'Yönetim Bilişim Sistemleri',
  university: 'İstanbul Üniversitesi',
  year: 2026,
  createdAt: new Date('2026-06-01T10:00:00Z'),
  isPublic: false,
  verificationUrl: null,
  linkedinUrl: null,
};

beforeEach(() => vi.clearAllMocks());

describe('MyAwards: yayın tercihi geri bildirimi', () => {
  it('başarıda toast; kaydederken düğme bekleyen durumu duyurur ve ikinci tıklama gitmez', async () => {
    let release: (() => void) | undefined;
    mocks.setPublication.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, data: { ...award, isPublic: true } });
        }),
    );
    const { user } = renderWithToasts(<MyAwards awards={[award]} />);
    await user.click(screen.getByRole('switch'));
    await user.dblClick(screen.getByRole('button', { name: 'Kaydet' }));
    expect(screen.getByRole('button', { name: /Kaydediliyor/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    release?.();
    expect(await screen.findByText(messages.yearAlumni.saved)).toBeInTheDocument();
    expect(mocks.setPublication).toHaveBeenCalledTimes(1);
  });

  it('hatada kararlı hata metni gösterilir, anahtar seçimi korunur, başarı bildirimi çıkmaz', async () => {
    mocks.setPublication.mockResolvedValue({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
    const { user } = renderWithToasts(<MyAwards awards={[award]} />);
    const toggle = screen.getByRole('switch');
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mocks.setPublication).toHaveBeenCalled());
    expect(await screen.findByText(messages.errors.codes.RESOURCE_NOT_FOUND)).toBeInTheDocument();
    expect(toggle).toBeChecked();
    expect(screen.queryByText(messages.yearAlumni.saved)).toBeNull();
  });
});

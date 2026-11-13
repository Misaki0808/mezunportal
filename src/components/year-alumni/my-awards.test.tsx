// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const publicAward: MyAward = {
  ...award,
  isPublic: true,
  verificationUrl: 'https://mezun.example/dogrula/ABC123',
  linkedinUrl: 'https://www.linkedin.com/profile/add?name=odul',
};
const SHARE_TEXT =
  'İstanbul Üniversitesi Yönetim Bilişim Sistemleri bölümünde 2026 akademik yılı Yılın Mezunu ödülünü aldım. Doğrula: https://mezun.example/dogrula/ABC123';

function clipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}
afterEach(() => {
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
});

beforeEach(() => vi.clearAllMocks());

it('ödül yokken nötr başlık ve katkıya yönlendiren açıklama gösterir', () => {
  renderWithToasts(<MyAwards awards={[]} />);
  expect(screen.getByRole('heading', { name: 'Ödüllerin' })).toBeVisible();
  expect(screen.getByText('Henüz bir ödülün yok.')).toBeVisible();
  expect(screen.queryByText('Katkınla ilham verdin')).toBeNull();
  expect(screen.queryByText(messages.yearAlumni.intro)).toBeNull();
});
it('ödül varken tebrik başlığı korunur', () => {
  renderWithToasts(<MyAwards awards={[award]} />);
  expect(screen.getByRole('heading', { name: 'Katkınla ilham verdin' })).toBeVisible();
  expect(screen.queryByText('Henüz bir ödülün yok.')).toBeNull();
});

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

describe('MyAwards: kopyalama düğmeleri', () => {
  it('pano kapalıyken bağlantı düğmesi kopyalama cümlesini ve seçili bağlantı alanını gösterir, form hatası cümlesi çıkmaz', async () => {
    const { user } = renderWithToasts(<MyAwards awards={[publicAward]} />);
    clipboard(undefined);
    await user.click(screen.getByRole('button', { name: messages.yearAlumni.copy }));
    expect(await screen.findByText(messages.yearAlumni.copyFailed)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(screen.queryByText(messages.yearAlumni.invalid)).toBeNull();
    const field = screen.getByRole('textbox', { name: messages.yearAlumni.copyFieldLabel });
    expect(field).toHaveValue(publicAward.verificationUrl);
    expect(field).toHaveAttribute('readonly');
  });

  it('pano kapalıyken paylaşım düğmesi metni çok satırlı alanda gösterir', async () => {
    const { user } = renderWithToasts(<MyAwards awards={[publicAward]} />);
    clipboard(undefined);
    await user.click(screen.getByRole('button', { name: messages.yearAlumni.share }));
    expect(await screen.findByText(messages.yearAlumni.shareFailed)).toHaveAttribute(
      'role',
      'alert',
    );
    expect(screen.getByRole('textbox', { name: messages.yearAlumni.shareFieldLabel })).toHaveValue(
      SHARE_TEXT,
    );
    expect(screen.queryByText(messages.yearAlumni.invalid)).toBeNull();
  });

  it('pano açıkken her düğme kendi metnini kopyalar ve kendi toast metnini gösterir', async () => {
    const { user } = renderWithToasts(<MyAwards awards={[publicAward]} />);
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard({ writeText });
    await user.click(screen.getByRole('button', { name: messages.yearAlumni.copy }));
    expect(await screen.findByText(messages.yearAlumni.copied)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: messages.yearAlumni.share }));
    expect(await screen.findByText(messages.yearAlumni.shareCopied)).toBeInTheDocument();
    expect(writeText.mock.calls).toEqual([[publicAward.verificationUrl], [SHARE_TEXT]]);
  });
});

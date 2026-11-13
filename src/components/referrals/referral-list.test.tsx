// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderUi } from '@/test/render';
import type { ReferralPage, ReferralView } from '@/contracts/referrals';
import { ReferralList } from './referral-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/server/actions/referrals', () => ({}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const empty: ReferralPage = { items: [], nextCursor: null };
const one = {
  id: 'r1',
  status: 'PROPOSED',
  organizationName: 'Örnek Kurum',
  student: { id: 'u-student', name: 'Deniz A.' },
  alumnus: { id: 'u-alumni', name: 'Mert Y.' },
} as unknown as ReferralView;

describe('referanslarım: boş durum role göre', () => {
  it('mezun: başlatabilen rol; tek eylem "Referans verdim", başlıktaki gizlenir', () => {
    renderUi(<ReferralList initial={empty} userId="u-alumni" canCreate />);
    expect(screen.getByText('Henüz referans beyanın yok')).toBeVisible();
    expect(screen.getByText(/önce öğrenci onaylar/)).toBeVisible();
    const create = screen.getAllByRole('link', { name: 'Referans verdim' });
    expect(create).toHaveLength(1);
    expect(create[0]).toHaveAttribute('href', '/referans/yeni');
    // Düğme boş durum kartının içinde (kardeşi boş durum başlığı), başlık satırında değil.
    expect(create[0]!.parentElement!.querySelector('h2')).toHaveTextContent(
      'Henüz referans beyanın yok',
    );
  });

  it('öğrenci: eylem yok, nedeni yazılı (referansı yalnız mezun başlatır)', () => {
    renderUi(<ReferralList initial={empty} userId="u-student" canReceive />);
    expect(screen.getByText('Henüz referansın yok')).toBeVisible();
    expect(screen.getByText(/Referansı yalnız mezun başlatır/)).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('başka rol: eylem yok, referansın mezun ile öğrenci arasında olduğu yazılı', () => {
    renderUi(<ReferralList initial={empty} userId="u-academic" />);
    expect(screen.getByText('Henüz referans yok')).toBeVisible();
    expect(screen.getByText(/mezunlarla öğrenciler arasındadır/)).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('inceleme (yönetici): kendi cümlesi, eylem yok', () => {
    renderUi(<ReferralList initial={empty} userId="u-admin" moderation />);
    expect(screen.getByText('Henüz gösterilecek referans yok.')).toBeVisible();
    expect(screen.getByText(/geldikçe burada incelenir/)).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('mezunda referans varken "Referans verdim" başlıkta kalır (bugünkü düzen)', () => {
    renderUi(
      <ReferralList initial={{ items: [one], nextCursor: null }} userId="u-alumni" canCreate />,
    );
    const create = screen.getAllByRole('link', { name: 'Referans verdim' });
    expect(create).toHaveLength(1);
    expect(screen.queryByText('Henüz referans beyanın yok')).not.toBeInTheDocument();
  });
});

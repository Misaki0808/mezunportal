// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToasts as renderUi } from '@/test/render';
import type { ReferralPage, ReferralView } from '@/contracts/referrals';
import { ReferralList } from './referral-ui';

const mocks = vi.hoisted(() => ({ review: vi.fn(), respond: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/server/actions/referrals', () => ({
  reviewReferral: mocks.review,
  respondReferral: mocks.respond,
}));
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

describe('referans inceleme kuyruğu: karar sonrası geri bildirim', () => {
  const waiting = (id: string, organization: string) =>
    ({
      id,
      status: 'STUDENT_CONFIRMED',
      organizationName: organization,
      student: { id: 'u-student', name: 'Deniz A.' },
      alumnus: { id: 'u-alumni', name: 'Mert Y.' },
    }) as unknown as ReferralView;
  const queue: ReferralPage = {
    items: [waiting('r1', 'Birinci Kurum'), waiting('r2', 'İkinci Kurum')],
    nextCursor: null,
  };
  const row = (organization: string) => within(screen.getByText(organization).closest('li')!);
  beforeEach(() => {
    mocks.review.mockReset();
    mocks.respond.mockReset();
    mocks.review.mockResolvedValue({ ok: true, data: { status: 'APPROVED' } });
  });

  it('onay başarılı olunca görünür bildirim verir', async () => {
    const { user } = renderUi(<ReferralList initial={queue} userId="u-admin" moderation />);
    await user.click(row('Birinci Kurum').getByRole('button', { name: 'Onayla' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    expect(await screen.findByText('Beyan onaylandı.')).toBeVisible();
    expect(screen.queryByText('Birinci Kurum')).toBeNull();
    expect(mocks.review).toHaveBeenCalledWith({
      referralId: 'r1',
      stage: 'REFERRAL',
      decision: 'APPROVE',
    });
  });

  it('ret gerekçesiz gitmez; gerekçeyle başarılı olunca bildirim verir', async () => {
    const { user } = renderUi(<ReferralList initial={queue} userId="u-admin" moderation />);
    await user.click(row('İkinci Kurum').getByRole('button', { name: 'Reddet' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Reddet' }));
    expect(mocks.review).not.toHaveBeenCalled();
    expect(screen.queryByText('Beyan reddedildi.')).toBeNull();
    await user.type(dialog.getByLabelText(/Ret gerekçesi/), 'Kurum bilgisi tutarsız');
    await user.click(dialog.getByRole('button', { name: 'Reddet' }));
    expect(await screen.findByText('Beyan reddedildi.')).toBeVisible();
    await waitFor(() => expect(screen.queryByText('İkinci Kurum')).toBeNull());
  });

  it('karar başarısızsa başarı bildirimi vermez', async () => {
    mocks.review.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const { user } = renderUi(<ReferralList initial={queue} userId="u-admin" moderation />);
    await user.click(row('Birinci Kurum').getByRole('button', { name: 'Onayla' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Onayla' }));
    expect(await dialog.findByText(/Beklenmeyen bir sorun oluştu/)).toBeVisible();
    expect(screen.queryByText('Beyan onaylandı.')).toBeNull();
    expect(screen.getByText('Birinci Kurum')).toBeVisible();
  });

  it('öğrencinin kendi yanıtı bu bildirimi vermez (satır kendi durumunu gösterir)', async () => {
    mocks.respond.mockResolvedValue({ ok: true, data: { status: 'STUDENT_CONFIRMED' } });
    const proposed = { ...waiting('r3', 'Üçüncü Kurum'), status: 'PROPOSED' } as ReferralView;
    const { user } = renderUi(
      <ReferralList initial={{ items: [proposed], nextCursor: null }} userId="u-student" />,
    );
    await user.click(row('Üçüncü Kurum').getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(mocks.respond).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(row('Üçüncü Kurum').getByText('Yönetici onayı bekleniyor')).toBeVisible(),
    );
    expect(screen.queryByText('Beyan onaylandı.')).toBeNull();
    expect(mocks.review).not.toHaveBeenCalled();
  });
});

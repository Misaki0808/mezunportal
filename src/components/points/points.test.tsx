// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  ContributionOverview,
  PointEntryView,
  PointRuleView,
  SuspicionFlagView,
} from '@/contracts/points';
import { renderUi } from '@/test/render';

import { AdminPoints, type AdminPointsActions } from './admin-points';
import { Contribution } from './contribution';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const entry = (over: Partial<PointEntryView> = {}): PointEntryView => ({
  id: 'e1',
  action: 'EXPERIENCE_PUBLISHED',
  basePoints: 5,
  multiplierPercent: 100,
  points: 5,
  status: 'FINAL',
  createdAt: new Date('2026-11-01T09:00:00Z'),
  finalizesAt: null,
  revokedReason: null,
  ...over,
});
const overview = (
  items: PointEntryView[],
  nextCursor: string | null = null,
): ContributionOverview => ({
  summary: {
    total: 12,
    pending: 15,
    badges: [{ kind: 'FOUNDING_MEMBER', awardedAt: new Date('2026-11-02T09:00:00Z') }],
  },
  history: { items, nextCursor },
});

describe('katkı puanı (profil)', () => {
  it('toplam, bekleyen, kurucu üye etiketi ve geçmişi gösterir; kaynak kimliği çizilmez', () => {
    renderUi(
      <Contribution
        initial={overview([
          entry(),
          entry({
            id: 'e2',
            action: 'SESSION_IN_PERSON',
            basePoints: 15,
            multiplierPercent: 50,
            points: 7,
            status: 'PENDING',
            finalizesAt: new Date('2026-11-20T09:00:00Z'),
          }),
          entry({ id: 'e3', status: 'REVOKED', revokedReason: 'FRAUD_CONFIRMED' }),
        ])}
        list={vi.fn()}
      />,
    );
    expect(screen.getByText('Toplam puan').nextElementSibling).toHaveTextContent('12');
    expect(screen.getByText('Bekleyen puan').nextElementSibling).toHaveTextContent('15');
    expect(screen.getByText('Kurucu üye')).toBeVisible();
    expect(screen.getByText('Yüz yüze görüşme')).toBeVisible();
    expect(screen.getByText(/20 Kas 2026 tarihinde kesinleşir/)).toBeVisible();
    expect(screen.getByText('Çarpan %50 (taban 15 puan)')).toBeVisible();
    expect(screen.getByText('Kuralları ihlal eden işlem olarak doğrulandı')).toBeVisible();
  });

  it('boş geçmişte açıklayıcı boş durum gösterir', () => {
    renderUi(
      <Contribution
        initial={{ ...overview([]), summary: { total: 0, pending: 0, badges: [] } }}
        list={vi.fn()}
      />,
    );
    expect(screen.getByText('Henüz puan kaydı yok.')).toBeVisible();
    expect(screen.queryByText('Kurucu üye')).not.toBeInTheDocument();
  });

  it('daha fazla yükler ve hatayı katalog metniyle gösterir', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: overview([entry({ id: 'e9', action: 'CV_REVIEW_HELPFUL' })]),
      })
      .mockResolvedValueOnce({ ok: false, errorCode: 'RATE_LIMITED' });
    renderUi(<Contribution initial={overview([entry()], 'c1')} list={list} />);
    fireEvent.click(screen.getByRole('button', { name: 'Daha fazla göster' }));
    expect(await screen.findByText('CV incelemen faydalı bulundu')).toBeVisible();
    expect(list).toHaveBeenCalledWith({ cursor: 'c1' });
    expect(screen.queryByRole('button', { name: 'Daha fazla göster' })).not.toBeInTheDocument();
  });
});

const rule = (over: Partial<PointRuleView> = {}): PointRuleView => ({
  action: 'SESSION_ONLINE',
  points: 10,
  delayDays: 0,
  isActive: true,
  updatedAt: new Date('2026-11-01T09:00:00Z'),
  ...over,
});
const flag = (over: Partial<SuspicionFlagView> = {}): SuspicionFlagView => ({
  id: 'f1',
  userId: 'u1',
  displayName: 'Deniz Aksoy',
  rule: 'SINGLE_COUNTERPART',
  status: 'OPEN',
  details: {
    windowStart: new Date('2026-11-01T09:00:00Z'),
    windowEnd: new Date('2026-11-08T09:00:00Z'),
    entryCount: 4,
    points: 40,
    sharePercent: 90,
    syncedCount: null,
  },
  createdAt: new Date('2026-11-08T09:00:00Z'),
  decidedAt: null,
  ...over,
});
const actions = (over: Partial<AdminPointsActions> = {}): AdminPointsActions => ({
  updateRule: vi.fn(async (input) => ({ ok: true as const, data: { ...rule(), ...input } })),
  listEntries: vi.fn(async () => ({
    ok: true as const,
    data: { items: [entry()], nextCursor: null },
  })),
  revokeEntry: vi.fn(async () => ({
    ok: true as const,
    data: { entryId: 'e1', badgeRevoked: false },
  })),
  listFlags: vi.fn(async () => ({ ok: true as const, data: { items: [], nextCursor: null } })),
  decide: vi.fn(async () => ({
    ok: true as const,
    data: { flagId: 'f1', status: 'CONFIRMED' as const, revokedCount: 3 },
  })),
  backfill: vi.fn(async () => ({ ok: true as const, data: { queued: true } })),
  ...over,
});

function dialog() {
  return within(screen.getByRole('dialog'));
}

describe('puan yönetimi (sistem yöneticisi)', () => {
  it('kural değişikliği gerekçesiz gönderilmez; gerekçeyle sayılar sözleşmeye uygun gider', async () => {
    const a = actions();
    renderUi(<AdminPoints rules={[rule()]} flags={{ items: [], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
    fireEvent.change(dialog().getByLabelText(/^Puan/), { target: { value: '12' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Kuralı kaydet' }));
    expect(a.updateRule).not.toHaveBeenCalled();
    expect(dialog().getByText('Gerekçe 3–1000 karakter olmalı.')).toBeVisible();
    fireEvent.change(dialog().getByLabelText(/Gerekçe/), { target: { value: 'Pilot ayarı' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Kuralı kaydet' }));
    await waitFor(() =>
      expect(a.updateRule).toHaveBeenCalledWith({
        action: 'SESSION_ONLINE',
        points: 12,
        delayDays: 0,
        isActive: true,
        reason: 'Pilot ayarı',
      }),
    );
    expect(await screen.findByText('Kural kaydedildi.')).toBeVisible();
  });

  it('aralık dışı puan istekten önce engellenir', () => {
    const a = actions();
    renderUi(<AdminPoints rules={[rule()]} flags={{ items: [], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
    fireEvent.change(dialog().getByLabelText(/^Puan/), { target: { value: '101' } });
    fireEvent.change(dialog().getByLabelText(/Gerekçe/), { target: { value: 'Pilot ayarı' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Kuralı kaydet' }));
    expect(a.updateRule).not.toHaveBeenCalled();
    expect(dialog().getByText(/izin verilen aralıkta/)).toBeVisible();
  });

  it('şüphe onayı gerekçeyle gider, geri alınan sayıyı bildirir ve satırı kuyruktan çıkarır', async () => {
    const a = actions();
    renderUi(<AdminPoints rules={[]} flags={{ items: [flag()], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Şüpheli işaretler' }));
    expect(screen.getAllByText('Deniz Aksoy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tek karşı tarafın payı: %90').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Onayla' })[0]!);
    fireEvent.change(dialog().getByLabelText(/Gerekçe/), {
      target: { value: 'Tek kişiden tekrar' },
    });
    fireEvent.click(dialog().getByRole('button', { name: 'Onayla ve geri al' }));
    await waitFor(() =>
      expect(a.decide).toHaveBeenCalledWith({
        flagId: 'f1',
        decision: 'CONFIRM',
        reason: 'Tek kişiden tekrar',
      }),
    );
    expect(await screen.findByText('Karar kaydedildi. Geri alınan kayıt sayısı: 3.')).toBeVisible();
    expect(screen.queryByText('Deniz Aksoy')).not.toBeInTheDocument();
  });

  it('puan iptali: kullanıcı kimliği şart; sunucu hatası katalog metniyle görünür', async () => {
    const a = actions({
      revokeEntry: vi.fn(async () => ({
        ok: false as const,
        errorCode: 'POINT_ALREADY_REVOKED' as const,
      })),
    });
    renderUi(<AdminPoints rules={[]} flags={{ items: [], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Puan kayıtları' }));
    fireEvent.click(screen.getByRole('button', { name: 'Listele' }));
    expect(a.listEntries).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Kullanıcı kimliği/), { target: { value: 'u1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Listele' }));
    await waitFor(() => expect(a.listEntries).toHaveBeenCalledWith({ userId: 'u1' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Puanı geri al' }))[0]!);
    fireEvent.change(dialog().getByLabelText(/Gerekçe/), { target: { value: 'Hatalı kayıt' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Puanı geri al' }));
    expect(await dialog().findByText('Bu puan kaydı zaten geri alınmış.')).toBeVisible();
  });

  it('geriye dönük hesaplama onayla başlar, sonra sebebiyle kilitlenir', async () => {
    const a = actions();
    renderUi(<AdminPoints rules={[]} flags={{ items: [], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Geriye dönük hesaplama' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hesaplamayı başlat' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Hesaplamayı başlat' }));
    await waitFor(() => expect(a.backfill).toHaveBeenCalledWith({}));
    expect(await screen.findByRole('status')).toHaveTextContent('sıraya alındı');
    expect(screen.getByRole('button', { name: 'Hesaplamayı başlat' })).toBeDisabled();
  });
});

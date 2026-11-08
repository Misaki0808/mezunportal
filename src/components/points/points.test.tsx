// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { AdminUserSummary } from '@/contracts/admin-users';
import type {
  ContributionOverview,
  PointEntryView,
  PointRuleView,
  SuspicionFlagView,
} from '@/contracts/points';
import { renderUi } from '@/test/render';

import { AdminPoints, type AdminPointsActions } from './admin-points';
import { Contribution, ContributionSummary } from './contribution';

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

  it('çarpan satırı yalnız indirimli ve geri alınmamış kayıtta görünür', () => {
    renderUi(
      <Contribution
        initial={overview([
          entry({ id: 'a', multiplierPercent: 100 }),
          entry({ id: 'b', multiplierPercent: 25, basePoints: 10, points: 2 }),
          entry({ id: 'c', multiplierPercent: 50, basePoints: 8, points: 4, status: 'REVOKED' }),
        ])}
        list={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/^Çarpan %/)).toHaveLength(1);
    expect(screen.getByText('Çarpan %25 (taban 10 puan)')).toBeVisible();
    expect(screen.queryByText(/%50/)).not.toBeInTheDocument();
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
const person = (over: Partial<AdminUserSummary> = {}): AdminUserSummary => ({
  id: 'u1',
  displayName: 'Deniz Aksoy',
  maskedEmail: 'd***@o***.iu.edu.tr',
  maskedPhone: null,
  status: 'ACTIVE',
  memberships: [],
  isAdmin: false,
  mentorActive: false,
  manageable: false,
  ...over,
});
/** Kayıt sekmesi: kimlik yazdırmadan ad ile arayıp sonuçtan seçer (seçince kayıtlar yüklenir). */
function pickPerson(name = 'Deniz Aksoy') {
  fireEvent.change(screen.getByLabelText(/Kullanıcı ara/), { target: { value: 'deniz' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ara' }));
  return screen
    .findByRole('button', { name: `Seç: ${name}` })
    .then((button) => fireEvent.click(button));
}
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
  searchUsers: vi.fn(async () => ({
    ok: true as const,
    data: { items: [person()], nextCursor: null },
  })),
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

describe('katkı puanı özeti (profilde üstte)', () => {
  it('özet tek başına toplam, bekleyen ve rozeti gösterir; geçmiş bağlantısı geçmişe iner', () => {
    renderUi(<ContributionSummary summary={overview([]).summary} />);
    expect(screen.getByText('Toplam puan').nextElementSibling).toHaveTextContent('12');
    expect(screen.getByText('Bekleyen puan').nextElementSibling).toHaveTextContent('15');
    expect(screen.getByText('Kurucu üye')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Puan geçmişine git' })).toHaveAttribute(
      'href',
      '#points-history',
    );
  });

  it('yalnız geçmiş varyantı özeti ikinci kez çizmez', () => {
    renderUi(<Contribution initial={overview([entry()])} list={vi.fn()} variant="history" />);
    expect(screen.queryByText('Toplam puan')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Puan geçmişi' })).toBeVisible();
    expect(screen.getByText('Deneyim yayınlandı')).toBeVisible();
  });
});

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
    fireEvent.click(screen.getByRole('tab', { name: 'Şüpheli' }));
    expect(screen.getAllByText('Deniz Aksoy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tek karşı tarafın payı: %90').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Şüpheyi doğrula' })[0]!);
    fireEvent.change(dialog().getByLabelText(/Gerekçe/), {
      target: { value: 'Tek kişiden tekrar' },
    });
    fireEvent.click(dialog().getByRole('button', { name: 'Doğrula ve puanı geri al' }));
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
    fireEvent.click(screen.getByRole('tab', { name: 'Kayıt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ara' }));
    expect(screen.getByText('En az 2 karakter yaz.')).toBeVisible();
    expect(a.searchUsers).not.toHaveBeenCalled();
    expect(a.listEntries).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/kimliği/i)).not.toBeInTheDocument();
    await pickPerson();
    expect(a.searchUsers).toHaveBeenCalledWith(expect.objectContaining({ query: 'deniz' }));
    await waitFor(() => expect(a.listEntries).toHaveBeenCalledWith({ userId: 'u1' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Puanı geri al' }))[0]!);
    fireEvent.change(dialog().getByLabelText(/Gerekçe/), { target: { value: 'Hatalı kayıt' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Puanı geri al' }));
    expect(await dialog().findByText('Bu puan kaydı zaten geri alınmış.')).toBeVisible();
  });

  it('kayıt listesinde geri alınmış kayıt yeniden iptal edilemez; bekleyen "iptal", kesinleşmiş "geri al" der', async () => {
    const a = actions({
      listEntries: vi.fn(async () => ({
        ok: true as const,
        data: {
          items: [
            entry({ id: 'f', status: 'FINAL' }),
            entry({ id: 'p', status: 'PENDING', finalizesAt: new Date('2026-11-20T09:00:00Z') }),
            entry({ id: 'r', status: 'REVOKED', revokedReason: 'ADMIN_CANCEL' }),
          ],
          nextCursor: null,
        },
      })),
    });
    renderUi(<AdminPoints rules={[]} flags={{ items: [], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Kayıt' }));
    await pickPerson();
    await screen.findAllByRole('button', { name: 'Puanı geri al' });
    // Satırlar mobil kart + masaüstü tablo olarak iki kez çizilir (`ResponsiveRows`): kayıt başına iki düğme.
    expect(screen.getAllByRole('button', { name: 'Puanı geri al' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Puanı iptal et' })).toHaveLength(2);
  });

  it('şüphe onayı tehlikeli işlem olarak işaretlenir; ret işaretlenmez; çift tıklama tek istek gönderir', async () => {
    let release: () => void = () => undefined;
    const a = actions({
      decide: vi.fn(
        () =>
          new Promise<{
            ok: true;
            data: { flagId: string; status: 'CONFIRMED'; revokedCount: number };
          }>((resolve) => {
            release = () =>
              resolve({ ok: true, data: { flagId: 'f1', status: 'CONFIRMED', revokedCount: 1 } });
          }),
      ),
    });
    renderUi(<AdminPoints rules={[]} flags={{ items: [flag()], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Şüpheli' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Şüpheyi kaldır' })[0]!);
    expect(dialog().getByRole('button', { name: 'Kaldır, puan kalsın' })).not.toHaveClass(
      'text-danger',
    );
    fireEvent.click(dialog().getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Şüpheyi doğrula' })[0]!);
    const confirm = dialog().getByRole('button', { name: 'Doğrula ve puanı geri al' });
    expect(confirm).toHaveClass('text-danger');
    fireEvent.change(dialog().getByLabelText(/Gerekçe/), { target: { value: 'Tekrarlı kayıt' } });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(a.decide).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('geriye dönük hesaplama onayla başlar, sonra sebebiyle kilitlenir', async () => {
    const a = actions();
    renderUi(<AdminPoints rules={[]} flags={{ items: [], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Hesaplama' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hesaplamayı başlat' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Hesaplamayı başlat' }));
    await waitFor(() => expect(a.backfill).toHaveBeenCalledWith({}));
    expect(await screen.findByRole('status')).toHaveTextContent('sıraya alındı');
    expect(screen.getByRole('button', { name: 'Hesaplamayı başlat' })).toBeDisabled();
  });
});

describe('şüphe etiketleri ne onaylandığını söyler', () => {
  it('düğmeler ve pencere sonucu açıkça yazar; belirsiz "Onayla/Reddet" kalmadı', () => {
    const a = actions();
    renderUi(<AdminPoints rules={[]} flags={{ items: [flag()], nextCursor: null }} actions={a} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Şüpheli' }));
    expect(screen.queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reddet' })).not.toBeInTheDocument();
    expect(screen.getByText(/işarete bağlı puanlar geri alınır/)).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Şüpheyi doğrula' })[0]!);
    expect(dialog().getByText('Şüpheyi doğrula — puanı geri al')).toBeVisible();
    expect(
      dialog().getByText(/puanlar geri alınır ve bu puanlardan gelen rozet kaldırılır/),
    ).toBeVisible();
    fireEvent.click(dialog().getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Şüpheyi kaldır' })[0]!);
    expect(dialog().getByText('Şüpheyi kaldır — puan kalsın')).toBeVisible();
    expect(dialog().getByRole('button', { name: 'Kaldır, puan kalsın' })).toBeVisible();
  });
});

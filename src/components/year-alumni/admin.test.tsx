// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AwardCycleView } from '@/contracts/year-alumni';
import { renderWithToasts } from '@/test/render';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  configure: vi.fn(),
  recalculate: vi.fn(),
  select: vi.fn(),
}));
vi.mock('@/server/actions/year-alumni', () => ({
  listAwardCandidates: mocks.list,
  configureAwardCycle: mocks.configure,
  recalculateAwardCycle: mocks.recalculate,
  selectYearAlumnus: mocks.select,
}));

import { AwardAdmin } from './admin';

const candidate = (userId: string, name: string, points: number) => ({
  userId,
  name,
  points,
  experienceCount: 1,
  meetingCount: 1,
  breakdown: [],
});
const FROZEN = new Date('2026-05-01T00:00:00Z');
const cycle = (overrides: Partial<AwardCycleView> = {}): AwardCycleView => ({
  year: 2025,
  departmentId: 'dep-1',
  ceremonyDate: '2026-06-30',
  frozenAt: FROZEN,
  candidates: [
    candidate('u1', 'Ayşe Örnek', 90),
    candidate('u2', 'Can Örnek', 70),
    candidate('u3', 'Deniz Örnek', 50),
  ],
  excludedForSuspicion: 0,
  selectedUserId: null,
  selectedNeedsReview: false,
  ...overrides,
});
const DEPARTMENTS = [{ id: 'dep-1', name: 'YBS' }];
const DAY = 86400_000;
const dateIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

// jsdom'da <dialog>.showModal/close yok; açık/kapalı niteliği taklit edilir (diğer pencere testleriyle aynı).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
// resetAllMocks: kırılan bir testin tüketmediği `mockResolvedValueOnce` değerleri sonraki testlere sızmasın.
beforeEach(() => vi.resetAllMocks());

async function openDecision(user: ReturnType<typeof renderWithToasts>['user'], name: string) {
  await user.click(screen.getByRole('button', { name: 'Adayları göster' }));
  const card = (await screen.findByRole('heading', { name })).closest('li')!;
  await user.click(within(card).getByRole('button', { name: 'Bu mezunu seç' }));
  return screen.getByRole('dialog');
}

describe('AwardAdmin: karar penceresi', () => {
  it('pencere her açılışta temiz başlar: önceki işlemin başarı/hata metni sızmaz', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: cycle() });
    mocks.configure.mockResolvedValue({ ok: true, data: cycle() });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    // Önce tören tarihi kaydedilir (başarı toast'tır, sayfada kalıcı metin bırakmaz).
    await user.type(screen.getByLabelText('Tören tarihi'), dateIn(90));
    await user.click(screen.getByRole('button', { name: 'Tören tarihini kaydet' }));
    await screen.findByText('Tören tarihi kaydedildi.');
    const dialog = await openDecision(user, 'Ayşe Örnek');
    expect(within(dialog).queryByText(/kaydedildi/)).toBeNull();
    expect(within(dialog).queryByText('Tercihin kaydedildi.')).toBeNull();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('gerekçesiz onay alanın altında açık sebep verir ve sunucuya gitmez', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: cycle() });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    const dialog = await openDecision(user, 'Ayşe Örnek');
    await user.click(within(dialog).getByRole('button', { name: 'Ödül kararını onayla' }));
    expect(await within(dialog).findByText('Gerekçeyi en az 3 karakterle yaz.')).toBeVisible();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('sunucu hatası pencerede kalır, gerekçe silinmez; kapatıp açınca hata kalmaz', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: cycle() });
    mocks.select.mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    const dialog = await openDecision(user, 'Ayşe Örnek');
    await user.type(within(dialog).getByLabelText('Karar gerekçesi'), 'Katkısı en yüksek');
    await user.click(within(dialog).getByRole('button', { name: 'Ödül kararını onayla' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeVisible());
    expect(within(dialog).getByLabelText('Karar gerekçesi')).toHaveValue('Katkısı en yüksek');
    await user.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    const reopened = await openDecisionAgain(user, 'Ayşe Örnek');
    expect(within(reopened).queryByRole('alert')).toBeNull();
    expect(within(reopened).getByLabelText('Karar gerekçesi')).toHaveValue('');
  });
});

describe('AwardAdmin: gerekçe alanları birbirine karışmaz', () => {
  it('gerekçesiz karar onayı yalnız pencerede hata verir; arkadaki yeniden hesaplama alanı temiz kalır', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: cycle() });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    const dialog = await openDecision(user, 'Ayşe Örnek');
    await user.click(within(dialog).getByRole('button', { name: 'Ödül kararını onayla' }));
    expect(await within(dialog).findByText('Gerekçeyi en az 3 karakterle yaz.')).toBeVisible();
    // Sayfadaki "Yeniden hesaplama gerekçesi" alanı aynı hatayı taşımaz.
    expect(screen.getAllByText('Gerekçeyi en az 3 karakterle yaz.')).toHaveLength(1);
    expect(screen.getByLabelText('Yeniden hesaplama gerekçesi')).not.toBeInvalid();
  });

  it('pencerede yazılan karar gerekçesi yeniden hesaplama alanına sızmaz; vazgeçince orada kalmaz', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: cycle() });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    const dialog = await openDecision(user, 'Ayşe Örnek');
    await user.type(within(dialog).getByLabelText('Karar gerekçesi'), 'Katkısı en yüksek');
    expect(screen.getByLabelText('Yeniden hesaplama gerekçesi')).toHaveValue('');
    await user.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    expect(screen.getByLabelText('Yeniden hesaplama gerekçesi')).toHaveValue('');
  });

  it('yeniden hesaplamada gerekçe yoksa hata kendi alanında; pencere açılınca bu hata gider', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: cycle() });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    await user.click(screen.getByRole('button', { name: 'Adayları göster' }));
    await screen.findByRole('heading', { name: 'Ayşe Örnek' });
    await user.click(screen.getByRole('button', { name: 'Listeyi yeniden hesapla' }));
    expect(await screen.findByLabelText('Yeniden hesaplama gerekçesi')).toBeInvalid();
    expect(mocks.recalculate).not.toHaveBeenCalled();
    const card = screen.getByRole('heading', { name: 'Ayşe Örnek' }).closest('li')!;
    await user.click(within(card).getByRole('button', { name: 'Bu mezunu seç' }));
    expect(screen.getByLabelText('Yeniden hesaplama gerekçesi')).not.toBeInvalid();
    expect(within(screen.getByRole('dialog')).queryByText(/en az 3 karakter/)).toBeNull();
  });
});

async function openDecisionAgain(user: ReturnType<typeof renderWithToasts>['user'], name: string) {
  const card = screen.getByRole('heading', { name }).closest('li')!;
  await user.click(within(card).getByRole('button', { name: 'Bu mezunu seç' }));
  return screen.getByRole('dialog');
}

describe('AwardAdmin: seçimden sonra kazanan belli olur', () => {
  it('başarı mesajı kişinin adını söyler; kazanan kart rozet alır, diğerlerinin düğmesi tek sebebe bağlanır', async () => {
    const chosen = cycle({ selectedUserId: 'u1' });
    mocks.list.mockResolvedValueOnce({ ok: true, data: cycle() });
    mocks.select.mockResolvedValue({ ok: true, data: { userId: 'u1' } });
    mocks.list.mockResolvedValueOnce({ ok: true, data: chosen });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    const dialog = await openDecision(user, 'Ayşe Örnek');
    await user.type(within(dialog).getByLabelText('Karar gerekçesi'), 'Katkısı en yüksek');
    await user.click(within(dialog).getByRole('button', { name: 'Ödül kararını onayla' }));

    expect(await screen.findByText('Ayşe Örnek yılın mezunu seçildi.')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const winnerCard = screen.getByRole('heading', { name: 'Ayşe Örnek' }).closest('li')!;
    expect(within(winnerCard).getByText('Bu yılın mezunu')).toBeVisible();
    expect(within(winnerCard).queryByRole('button', { name: 'Bu mezunu seç' })).toBeNull();

    // Diğer kartlarda "Yılın mezunu seçildi" ×N yok: sebep sayfada TEK yerde, düğmeler ona bağlı.
    const hint = screen.getByText('Bu dönem için Yılın Mezunu zaten seçildi.');
    expect(screen.getAllByText('Bu dönem için Yılın Mezunu zaten seçildi.')).toHaveLength(1);
    expect(screen.queryAllByText('Yılın mezunu seçildi.')).toHaveLength(0);
    for (const name of ['Can Örnek', 'Deniz Örnek']) {
      const card = screen.getByRole('heading', { name }).closest('li')!;
      expect(within(card).queryByText('Bu yılın mezunu')).toBeNull();
      const button = within(card).getByRole('button', { name: 'Bu mezunu seç' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-describedby', expect.stringContaining(hint.id));
    }
  });

  it('liste yenilemesi başarısız olsa da seçilen kişi hemen rozet alır', async () => {
    mocks.list.mockResolvedValueOnce({ ok: true, data: cycle() });
    mocks.select.mockResolvedValue({ ok: true, data: { userId: 'u2' } });
    mocks.list.mockResolvedValueOnce({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    const dialog = await openDecision(user, 'Can Örnek');
    await user.type(within(dialog).getByLabelText('Karar gerekçesi'), 'Dengeli katkı');
    await user.click(within(dialog).getByRole('button', { name: 'Ödül kararını onayla' }));
    const winnerCard = (await screen.findByRole('heading', { name: 'Can Örnek' })).closest('li')!;
    await waitFor(() => expect(within(winnerCard).getByText('Bu yılın mezunu')).toBeVisible());
  });
});

describe('AwardAdmin: tören tarihi sebebi alanın altında', () => {
  it('30 günden yakın tarih alanın altında açık sebep verir; sunucuya gitmez, genel mesaj çıkmaz', async () => {
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    await user.type(screen.getByLabelText('Tören tarihi'), dateIn(10));
    await user.click(screen.getByRole('button', { name: 'Tören tarihini kaydet' }));
    expect(await screen.findByText('Tören tarihi en az 30 gün sonra olmalı.')).toBeVisible();
    expect(screen.getByLabelText('Tören tarihi')).toBeInvalid();
    expect(mocks.configure).not.toHaveBeenCalled();
    expect(screen.queryByText(/Formda eksik/)).toBeNull();
    expect(screen.queryByText('Tercihin kaydedildi.')).toBeNull();
  });

  it('30 gün sınırı: 29 gün sonrası reddedilir, 32 gün sonrası sunucuya gider (İstanbul gece yarısı payıyla)', async () => {
    mocks.configure.mockResolvedValue({ ok: true, data: cycle() });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    const field = screen.getByLabelText('Tören tarihi');
    await user.type(field, dateIn(29));
    await user.click(screen.getByRole('button', { name: 'Tören tarihini kaydet' }));
    expect(await screen.findByText('Tören tarihi en az 30 gün sonra olmalı.')).toBeVisible();
    expect(mocks.configure).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, dateIn(32));
    await user.click(screen.getByRole('button', { name: 'Tören tarihini kaydet' }));
    await waitFor(() => expect(mocks.configure).toHaveBeenCalledTimes(1));
  });

  it('boş tarih "Tören tarihini seç." der; tarihi değiştirince sebep kalkar', async () => {
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    await user.click(screen.getByRole('button', { name: 'Tören tarihini kaydet' }));
    expect(await screen.findByText('Tören tarihini seç.')).toBeVisible();
    await user.type(screen.getByLabelText('Tören tarihi'), dateIn(60));
    expect(screen.queryByText('Tören tarihini seç.')).toBeNull();
  });

  it('sunucu tarihi reddederse (dönem donmuş) sebep tarih alanının altında, genel mesaj yok', async () => {
    mocks.configure.mockResolvedValue({ ok: false, errorCode: 'VALIDATION_INVALID' });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    await user.type(screen.getByLabelText('Tören tarihi'), dateIn(90));
    await user.click(screen.getByRole('button', { name: 'Tören tarihini kaydet' }));
    expect(await screen.findByText(/Bu tarih kaydedilemedi/)).toBeVisible();
    expect(screen.getByLabelText('Tören tarihi')).toBeInvalid();
    expect(screen.queryByText(/Formda eksik/)).toBeNull();
  });

  it('başarılı kayıt "Tercihin kaydedildi." değil, tören tarihine özgü metni toast olarak verir', async () => {
    mocks.configure.mockResolvedValue({ ok: true, data: cycle() });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    await user.type(screen.getByLabelText('Tören tarihi'), dateIn(90));
    await user.click(screen.getByRole('button', { name: 'Tören tarihini kaydet' }));
    expect(await screen.findByText('Tören tarihi kaydedildi.')).toBeVisible();
    expect(screen.queryByText('Tercihin kaydedildi.')).toBeNull();
  });
});

describe('AwardAdmin: seçim henüz açık değilken', () => {
  it('dondurulmamış listede kapalı düğmelerin sebebi bir kez yazılır, her kartta tekrarlanmaz', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: cycle({ frozenAt: null }) });
    const { user } = renderWithToasts(<AwardAdmin departments={DEPARTMENTS} />);
    await user.click(screen.getByRole('button', { name: 'Adayları göster' }));
    await screen.findByRole('heading', { name: 'Ayşe Örnek' });
    // Alanın ipucu da aynı cümleyi taşır; aday bölümünde sebep tek paragraf (kartlarda yok).
    const buttons = screen.getAllByRole('button', { name: 'Bu mezunu seç' });
    expect(buttons).toHaveLength(3);
    const hints = new Set(buttons.map((button) => button.getAttribute('aria-describedby')));
    expect(hints.size).toBe(1);
    const hintId = [...hints][0]!.split(' ').at(-1)!;
    expect(document.getElementById(hintId)).toHaveTextContent(
      'Liste törenden 30 gün önce dondurulur.',
    );
    for (const button of buttons) {
      expect(button.closest('li')).not.toHaveTextContent('Liste törenden 30 gün önce dondurulur.');
    }
  });
});

// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppointmentView, MentorSettingsView, SlotList } from '@/contracts/appointment';
import { renderUi, renderWithToasts } from '@/test/render';

import { AppointmentDetail } from './appointment-detail';
import { MentorSettings } from './mentor-settings';
import { MyAppointments } from './my-appointments';
import { SlotPicker } from './slot-picker';
import { dayKey, groupSlotsByDay, minutesToTime, timeLabel, timeToMinutes } from './time';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  router.refresh.mockReset();
});

describe('saat yardımcıları (İstanbul saati, tarayıcıdan bağımsız)', () => {
  it('UTC anını İstanbul saatiyle gösterir ve günlere gruplar', () => {
    const slot = new Date('2026-11-12T07:30:00Z'); // 10:30 İstanbul
    expect(timeLabel(slot)).toBe('10:30');
    expect(dayKey(new Date('2026-11-12T21:30:00Z'))).toBe('2026-11-13'); // gece yarısını geçince ertesi gün
    const groups = groupSlotsByDay([
      { startsAt: slot },
      { startsAt: new Date('2026-11-12T08:00:00Z') },
      { startsAt: new Date('2026-11-13T07:00:00Z') },
    ]);
    expect(groups.map((group) => group.slots.length)).toEqual([2, 1]);
  });
  it('dakika ↔ saat dönüşümü', () => {
    expect(minutesToTime(570)).toBe('09:30');
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('25:99')).toBeNull();
    expect(timeToMinutes('abc')).toBeNull();
  });
});

const slotList = (over: Partial<SlotList> = {}): SlotList => ({
  mentor: {
    userId: 'm1',
    displayName: 'Mert Yıldız',
    sessionMinutes: 30,
    inPersonNote: 'Kampüs kütüphane girişi',
  },
  slots: [
    {
      startsAt: new Date('2026-11-12T07:00:00Z'),
      endsAt: new Date('2026-11-12T07:30:00Z'),
      modes: ['ONLINE', 'IN_PERSON'],
    },
    {
      startsAt: new Date('2026-11-12T08:00:00Z'),
      endsAt: new Date('2026-11-12T08:30:00Z'),
      modes: ['ONLINE'],
    },
    {
      startsAt: new Date('2026-11-13T07:00:00Z'),
      endsAt: new Date('2026-11-13T07:30:00Z'),
      modes: ['ONLINE'],
    },
  ],
  unavailableReason: null,
  emailShared: true,
  ...over,
});

describe('slot seçici', () => {
  it('çift gönderim tek istektir; ağ hatasında not korunur', async () => {
    const gate = Promise.withResolvers<{ ok: true; data: unknown }>();
    const request = vi.fn(() => gate.promise);
    const { user } = renderWithToasts(<SlotPicker list={slotList()} request={request} />);
    await user.click(screen.getByRole('radio', { name: '11:00 saatini seç' }));
    const note = screen.getByLabelText(/Mentora not/);
    await user.type(note, 'Deneme notu');
    const button = screen.getByRole('button', { name: 'Randevu talep et' });
    fireEvent.submit(button.closest('form')!);
    fireEvent.submit(button.closest('form')!);
    expect(request).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => gate.reject(new Error('ağ')));
    expect(note).toHaveValue('Deneme notu');
    expect(await screen.findByText(/Beklenmeyen bir sorun/)).toBeVisible();
  });
  it('gün → saat → biçim → gönder: sözleşme biçiminde istek gider, başarıda onay görünümü', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const { user } = renderWithToasts(<SlotPicker list={slotList()} request={request} />);
    expect(screen.getByText('Saatler İstanbul saatidir.')).toBeInTheDocument();
    expect(screen.getByText(/mentor e-postanı görmez/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '10:00 saatini seç' }));
    await user.click(screen.getByRole('radio', { name: 'Yüz yüze' }));
    expect(screen.getByText('Buluşma yeri: Kampüs kütüphane girişi')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Mentora not/), 'Staj hakkında soru');
    await user.click(screen.getByRole('button', { name: 'Randevu talep et' }));
    expect(request).toHaveBeenCalledWith({
      mentorId: 'm1',
      startsAt: new Date('2026-11-12T07:00:00Z'),
      mode: 'IN_PERSON',
      note: 'Staj hakkında soru',
    });
    expect(await screen.findByRole('heading', { name: 'Talebin gönderildi' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Randevularıma git' })).toHaveAttribute(
      'href',
      '/randevular',
    );
  });

  it('saat seçilmeden gönderilmez; tek biçimli slotta biçim otomatik seçilir', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const { user } = renderWithToasts(<SlotPicker list={slotList()} request={request} />);
    await user.click(screen.getByRole('button', { name: 'Randevu talep et' }));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText('Önce bir saat seç.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '11:00 saatini seç' }));
    await user.click(screen.getByRole('button', { name: 'Randevu talep et' }));
    expect(request.mock.calls[0]![0]).toMatchObject({ mode: 'ONLINE' });
  });

  it('gün değişince saatler değişir ve seçim sıfırlanır', async () => {
    const { user } = renderWithToasts(<SlotPicker list={slotList()} request={vi.fn()} />);
    expect(screen.getAllByRole('radio', { name: /saatini seç/ })).toHaveLength(2);
    const days = screen
      .getAllByRole('radio')
      .filter((radio) => !/saatini seç/.test(radio.getAttribute('aria-label') ?? ''));
    await user.click(days[1]!);
    expect(screen.getAllByRole('radio', { name: /saatini seç/ })).toHaveLength(1);
  });

  it('sunucu SLOT_TAKEN dönerse katalog metniyle gösterir', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, errorCode: 'APPOINTMENT_SLOT_TAKEN' });
    const { user } = renderWithToasts(<SlotPicker list={slotList()} request={request} />);
    await user.click(screen.getByRole('radio', { name: '11:00 saatini seç' }));
    await user.click(screen.getByRole('button', { name: 'Randevu talep et' }));
    expect(await screen.findByText(/başkası tarafından alındı/)).toBeInTheDocument();
  });

  it.each([
    ['PAUSED', /ara vermiş/],
    ['CAPACITY_FULL', /kapasitesi dolu/],
    ['NO_AVAILABILITY', /henüz müsait saat eklememiş/],
  ] as const)('mentor talep almıyorsa (%s) sebebi yazılır, form çizilmez', (reason, text) => {
    renderWithToasts(
      <SlotPicker list={slotList({ slots: [], unavailableReason: reason })} request={vi.fn()} />,
    );
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Randevu talep et' })).not.toBeInTheDocument();
  });
});

const settingsView = (over: Partial<MentorSettingsView> = {}): MentorSettingsView => ({
  eligible: true,
  settings: {
    monthlyCapacity: 6,
    sessionMinutes: 30,
    meetingModes: ['ONLINE'],
    inPersonNote: null,
    isActive: true,
    pausedUntil: null,
  },
  rules: [{ weekday: 2, startMinute: 600, endMinute: 720, mode: null }],
  ...over,
});
const settingsActions = () => ({
  saveSettings: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  saveAvailability: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  setPause: vi.fn().mockResolvedValue({ ok: true, data: {} }),
});

describe('mentor ayarları', () => {
  it('uygun olmayan kullanıcıya sebep gösterilir', () => {
    renderUi(
      <MentorSettings
        initial={settingsView({ eligible: false, settings: null, rules: [] })}
        actions={settingsActions()}
      />,
    );
    expect(screen.getByText('Mentor olmak için henüz uygun değilsin')).toBeInTheDocument();
  });

  it('haftalık müsaitlik gün listesidir: her gün için anahtar; açık günün aralıkları görünür', () => {
    renderUi(<MentorSettings initial={settingsView()} actions={settingsActions()} />);
    expect(screen.getAllByRole('switch', { name: /günü müsait/ })).toHaveLength(7);
    expect(screen.getByRole('switch', { name: 'Salı günü müsait' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Pazartesi günü müsait' })).not.toBeChecked();
    expect(screen.getByDisplayValue('10:00')).toBeInTheDocument();
  });

  it('günü açıp aralık ekleyip kaydeder: dakikalar sözleşme biçiminde gider', async () => {
    const actions = settingsActions();
    const { user } = renderUi(
      <MentorSettings initial={settingsView({ rules: [] })} actions={actions} />,
    );
    await user.click(screen.getByRole('switch', { name: 'Pazartesi günü müsait' }));
    await user.click(screen.getByRole('button', { name: 'Müsaitliği kaydet' }));
    expect(actions.saveAvailability).toHaveBeenCalledWith({
      rules: [{ weekday: 1, startMinute: 540, endMinute: 720, mode: null }],
    });
    expect(await screen.findByText('Kaydedildi.')).toBeInTheDocument();
  });

  it('çakışan ve ters aralık sunucuya gitmeden alan hatası verir', async () => {
    const actions = settingsActions();
    const { user } = renderUi(
      <MentorSettings
        initial={settingsView({
          rules: [{ weekday: 1, startMinute: 540, endMinute: 720, mode: null }],
        })}
        actions={actions}
      />,
    );
    const monday = screen.getByRole('switch', { name: 'Pazartesi günü müsait' }).closest('li')!;
    await user.click(within(monday).getByRole('button', { name: 'Saat aralığı ekle' })); // 13:00–17:00
    const starts = within(monday).getAllByLabelText('Başlangıç');
    await user.clear(starts[1]!);
    await user.type(starts[1]!, '11:00');
    await user.click(screen.getByRole('button', { name: 'Müsaitliği kaydet' }));
    expect(actions.saveAvailability).not.toHaveBeenCalled();
    expect(within(monday).getByText('Aynı gündeki aralıklar çakışamaz.')).toBeInTheDocument();
    const ends = within(monday).getAllByLabelText('Bitiş');
    await user.clear(ends[0]!);
    await user.type(ends[0]!, '08:00');
    await user.click(screen.getByRole('button', { name: 'Müsaitliği kaydet' }));
    expect(within(monday).getByText('Bitiş, başlangıçtan sonra olmalı.')).toBeInTheDocument();
  });

  it('yüz yüze seçilince yer notu zorunlu; geçersiz kapasite alan hatası verir', async () => {
    const actions = settingsActions();
    const { user } = renderUi(<MentorSettings initial={settingsView()} actions={actions} />);
    await user.click(screen.getByRole('checkbox', { name: 'Yüz yüze' }));
    await user.click(screen.getByRole('button', { name: 'Ayarları kaydet' }));
    expect(actions.saveSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Yüz yüze için yer notu yaz.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Yüz yüze görüşme yeri/), 'Kampüs kafe');
    await user.clear(screen.getByLabelText(/Aylık görüşme kapasitesi/));
    await user.type(screen.getByLabelText(/Aylık görüşme kapasitesi/), '99');
    await user.click(screen.getByRole('button', { name: 'Ayarları kaydet' }));
    expect(screen.getByText('1 ile 40 arasında bir sayı gir.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Aylık görüşme kapasitesi/));
    await user.type(screen.getByLabelText(/Aylık görüşme kapasitesi/), '5');
    await user.click(screen.getByRole('button', { name: 'Ayarları kaydet' }));
    expect(actions.saveSettings).toHaveBeenCalledWith({
      monthlyCapacity: 5,
      sessionMinutes: 30,
      meetingModes: ['ONLINE', 'IN_PERSON'],
      inPersonNote: 'Kampüs kafe',
      isActive: true,
    });
  });

  it('müsait değilim: tarih seçilmeden kaydedilmez; açıkken tarih, kapatınca null gider', async () => {
    const actions = settingsActions();
    const { user } = renderUi(<MentorSettings initial={settingsView()} actions={actions} />);
    await user.click(screen.getAllByRole('switch', { name: /Müsait değilim/ })[0]!);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(actions.setPause).not.toHaveBeenCalled();
    expect(screen.getByText('Geçerli bir tarih seç.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Şu tarihe kadar/), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(actions.setPause).toHaveBeenCalledWith({
      pausedUntil: new Date('2026-12-01T23:59:00+03:00'),
    });
  });
});

const view = (
  over: Partial<AppointmentView> = {},
  actionOver: Partial<AppointmentView['actions']> = {},
): AppointmentView => ({
  id: 'a1',
  status: 'REQUESTED',
  role: 'MENTOR',
  counterpart: { userId: 'u2', displayName: 'Deniz Aksoy' },
  startsAt: new Date('2026-11-12T07:00:00Z'),
  endsAt: new Date('2026-11-12T07:30:00Z'),
  mode: 'ONLINE',
  note: 'Staj hakkında soru',
  location: null,
  meetUrl: null,
  linkNeeded: false,
  expiresAt: new Date('2026-11-10T07:00:00Z'),
  decidedAt: null,
  cancelledBy: null,
  cancelReason: null,
  createdAt: new Date('2026-11-07T07:00:00Z'),
  actions: {
    canConfirm: true,
    confirmBlockedReason: null,
    canDecline: true,
    canCancel: false,
    canSetLink: false,
    canDownloadIcs: false,
    ...actionOver,
  },
  ...over,
});
const detailActions = () => ({
  respond: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  cancel: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  setMeetLink: vi.fn().mockResolvedValue({ ok: true, data: {} }),
});

describe('randevu detayı', () => {
  it('bekleyen talepte onay çalışır ve sunucu verisi yenilenir', async () => {
    const actions = detailActions();
    const { user } = renderUi(<AppointmentDetail appointment={view()} actions={actions} />);
    expect(screen.getByText('Yanıt bekliyor')).toBeInTheDocument();
    expect(screen.getByText('Staj hakkında soru')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(actions.respond).toHaveBeenCalledWith({ decision: 'CONFIRM', appointmentId: 'a1' });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('kapasite doluysa onay düğmesi devre dışı ve sebebi yazar', () => {
    renderUi(
      <AppointmentDetail
        appointment={view({}, { canConfirm: false, confirmBlockedReason: 'CAPACITY_FULL' })}
        actions={detailActions()}
      />,
    );
    const button = screen.getByRole('button', { name: 'Onayla' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Bu ayki kapasiten dolu; onaylayamazsın.')).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription('Bu ayki kapasiten dolu; onaylayamazsın.');
  });

  it('ret penceresi isteğe bağlı gerekçeyle gider', async () => {
    const actions = detailActions();
    const { user } = renderUi(<AppointmentDetail appointment={view()} actions={actions} />);
    await user.click(screen.getByRole('button', { name: 'Reddet' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Ret gerekçesi/), 'Takvimim dolu');
    await user.click(within(dialog).getByRole('button', { name: 'Reddet' }));
    expect(actions.respond).toHaveBeenCalledWith({
      decision: 'DECLINE',
      appointmentId: 'a1',
      reason: 'Takvimim dolu',
    });
  });

  it('onaylı online randevuda link yoksa mentor elle ekler; http reddedilir, https gider', async () => {
    const actions = detailActions();
    const confirmed = view(
      { status: 'CONFIRMED', linkNeeded: true, expiresAt: null },
      {
        canConfirm: false,
        canDecline: false,
        canCancel: true,
        canSetLink: true,
        canDownloadIcs: true,
      },
    );
    const { user } = renderUi(<AppointmentDetail appointment={confirmed} actions={actions} />);
    expect(screen.getByText(/bağlantısı oluşturulamadı/)).toBeInTheDocument();
    await user.type(
      screen.getByRole('textbox', { name: /Görüşme bağlantısı/ }),
      'http://meet.example.com/abc',
    );
    await user.click(screen.getByRole('button', { name: 'Bağlantıyı kaydet' }));
    expect(actions.setMeetLink).not.toHaveBeenCalled();
    expect(screen.getByText(/https ile başlamalı/)).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: /Görüşme bağlantısı/ }));
    await user.type(
      screen.getByRole('textbox', { name: /Görüşme bağlantısı/ }),
      'https://meet.example.com/abc',
    );
    await user.click(screen.getByRole('button', { name: 'Bağlantıyı kaydet' }));
    expect(actions.setMeetLink).toHaveBeenCalledWith({
      appointmentId: 'a1',
      url: 'https://meet.example.com/abc',
    });
    expect(screen.getByRole('link', { name: 'Takvime ekle (.ics)' })).toHaveAttribute(
      'href',
      '/api/randevu/a1/ics',
    );
  });

  it('link varsa katılma bağlantısı güvenli açılır; talep eden için link yoksa bekleme metni', () => {
    const withLink = view(
      { status: 'CONFIRMED', meetUrl: 'https://meet.example.com/xyz', expiresAt: null },
      { canConfirm: false, canDecline: false },
    );
    const { rerender } = renderUi(
      <AppointmentDetail appointment={withLink} actions={detailActions()} />,
    );
    const link = screen.getByRole('link', { name: 'Görüşmeye katıl' });
    expect(link).toHaveAttribute('href', 'https://meet.example.com/xyz');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    rerender(
      <AppointmentDetail
        appointment={view(
          { status: 'CONFIRMED', role: 'MENTEE', linkNeeded: true, expiresAt: null },
          { canConfirm: false, canDecline: false },
        )}
        actions={detailActions()}
      />,
    );
    expect(screen.getByText('Mentor görüşme bağlantısını ekleyecek.')).toBeInTheDocument();
  });

  it('iptal onay penceresinden sonra gider; sunucu hatası katalog metniyle gösterilir', async () => {
    const actions = {
      ...detailActions(),
      cancel: vi.fn().mockResolvedValue({ ok: false, errorCode: 'APPOINTMENT_NOT_CANCELLABLE' }),
    };
    const { user } = renderUi(
      <AppointmentDetail
        appointment={view(
          { status: 'CONFIRMED', expiresAt: null },
          { canConfirm: false, canDecline: false, canCancel: true },
        )}
        actions={actions}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Randevuyu iptal et' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Evet, iptal et' }),
    );
    expect(actions.cancel).toHaveBeenCalledWith({ appointmentId: 'a1' });
    expect(await screen.findByText('Bu randevu iptal edilemez.')).toBeInTheDocument();
  });
});

describe('randevularım', () => {
  const page = (items: AppointmentView[], nextCursor: string | null = null) => ({
    items,
    nextCursor,
  });
  it('durum rozeti, saat (İstanbul) ve açma bağlantısı; Giden sekmesi sunucudan yeniden listeler', async () => {
    const list = vi.fn().mockResolvedValue({
      ok: true,
      data: page([view({ id: 'b2', role: 'MENTEE', status: 'CONFIRMED' })]),
    });
    const { user } = renderUi(
      <MyAppointments initial={page([view()])} initialRole="MENTOR" showSettings list={list} />,
    );
    expect(screen.getByText('Yanıt bekliyor')).toBeInTheDocument();
    expect(screen.getByText('10:00 – 10:30')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aç' })).toHaveAttribute('href', '/randevular/a1');
    expect(screen.getByRole('link', { name: 'Mentor ayarlarım' })).toHaveAttribute(
      'href',
      '/mentor/ayarlar',
    );
    await user.click(screen.getByRole('tab', { name: 'Giden' }));
    expect(list).toHaveBeenCalledWith({ role: 'MENTEE' });
    expect(await screen.findByText('Onaylandı')).toBeInTheDocument();
  });

  it('boş durumlar yönlendirir', async () => {
    const list = vi.fn().mockResolvedValue({ ok: true, data: page([]) });
    const { user } = renderUi(
      <MyAppointments initial={page([])} initialRole="MENTOR" showSettings={false} list={list} />,
    );
    expect(screen.getByText('Gelen talep yok')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mentor ayarlarım' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Giden' }));
    expect(await screen.findByText('Henüz randevu istemedin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mentor bul' })).toHaveAttribute('href', '/mentorlar');
  });
});

it('inceleyici: SLOT_TAKEN sonrası eski seçimi bırakır ve sunucunun slot listesini yeniler', async () => {
  const request = vi.fn().mockResolvedValue({ ok: false, errorCode: 'APPOINTMENT_SLOT_TAKEN' });
  const { user } = renderWithToasts(<SlotPicker list={slotList()} request={request} />);
  await user.click(screen.getByRole('radio', { name: '11:00 saatini seç' }));
  await user.click(screen.getByRole('button', { name: 'Randevu talep et' }));
  expect(await screen.findByText(/başkası tarafından alındı/)).toBeInTheDocument();
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('radio', { name: '11:00 saatini seç' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Randevu talep et' }));
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Önce bir saat seç.')).toBeVisible();
});
it('inceleyici: bekleyen sekme geçişinde ikinci tıklama listeyi yanlış rolle etiketleyemez', async () => {
  let release!: (value: unknown) => void;
  const list = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const { user } = renderUi(
    <MyAppointments
      initial={{ items: [view()], nextCursor: null }}
      initialRole="MENTOR"
      showSettings
      list={list}
    />,
  );
  await user.click(screen.getByRole('tab', { name: 'Giden' }));
  await user.click(screen.getByRole('tab', { name: 'Gelen' }));
  await act(async () =>
    release({
      ok: true,
      data: { items: [view({ role: 'MENTEE', status: 'CONFIRMED' })], nextCursor: null },
    }),
  );
  expect(list).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('tab', { name: 'Giden' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Giden');
  expect(screen.getByText('Onaylandı')).toBeVisible();
});
it('inceleyici: sekme yükleme hatasında eski liste kendi başlığıyla kalır', async () => {
  const { user } = renderUi(
    <MyAppointments
      initial={{ items: [view()], nextCursor: null }}
      initialRole="MENTOR"
      showSettings
      list={vi.fn().mockResolvedValue({ ok: false, errorCode: 'SERVER_UNEXPECTED' })}
    />,
  );
  await user.click(screen.getByRole('tab', { name: 'Giden' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('tab', { name: 'Gelen' })).toHaveAttribute('aria-selected', 'true');
});
it('inceleyici: sunucu uygun gördüğünde randevu detayında görüşme formuna giriş vardır', () => {
  renderUi(
    <AppointmentDetail
      appointment={view({ status: 'COMPLETED' })}
      actions={detailActions()}
      feedbackAvailable
    />,
  );
  expect(screen.getByRole('link', { name: 'Formu doldur' })).toHaveAttribute(
    'href',
    '/hesap/gorusme/a1',
  );
});

it('inceleyici: gün sonu 1440 dakikalık kural geçerli 00:00 alanıyla görünür ve aynı dakika ile kaydedilir', async () => {
  const actions = settingsActions();
  const { user } = renderUi(
    <MentorSettings
      initial={settingsView({
        rules: [{ weekday: 7, startMinute: 1380, endMinute: 1440, mode: null }],
      })}
      actions={actions}
    />,
  );
  expect(screen.getByLabelText('Bitiş')).toHaveValue('00:00');
  await user.click(screen.getByRole('button', { name: 'Müsaitliği kaydet' }));
  expect(actions.saveAvailability).toHaveBeenCalledWith({
    rules: [{ weekday: 7, startMinute: 1380, endMinute: 1440, mode: null }],
  });
});

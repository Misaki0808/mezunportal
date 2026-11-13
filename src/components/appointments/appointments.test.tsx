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

  it('boş durumda tek eylem "Mentor bul"dur ve mentor listesine gider', () => {
    renderWithToasts(
      <SlotPicker
        list={slotList({ slots: [], unavailableReason: 'NO_AVAILABILITY' })}
        request={vi.fn()}
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('Mentor bul');
    expect(links[0]).toHaveAttribute('href', '/mentorlar');
  });

  it('müsait saat kalmadıysa da aynı sıcak boş durum ve tek eylem görünür', () => {
    renderWithToasts(
      <SlotPicker list={slotList({ slots: [], unavailableReason: null })} request={vi.fn()} />,
    );
    expect(screen.getByText(/Önümüzdeki 3 hafta için müsait saat yok/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mentor bul' })).toHaveAttribute('href', '/mentorlar');
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
  it('üç bölümün kaydı açık adlandırılır ve her düğme yalnız kendi bölümünü kaydeder', async () => {
    const actions = settingsActions();
    const { user } = renderUi(<MentorSettings initial={settingsView()} actions={actions} />);
    const general = screen.getByRole('button', { name: 'Genel ayarları kaydet' });
    const pause = screen.getByRole('button', { name: 'Ara verme durumunu kaydet' });
    const weekly = screen.getByRole('button', { name: 'Haftalık saatleri kaydet' });
    expect(general).toHaveClass('bg-primary');
    expect(pause).toHaveClass('bg-primary');
    expect(weekly).toHaveClass('bg-primary');
    await user.click(general);
    expect(actions.saveSettings).toHaveBeenCalledTimes(1);
    expect(actions.setPause).not.toHaveBeenCalled();
    expect(actions.saveAvailability).not.toHaveBeenCalled();
    await user.click(pause);
    expect(actions.setPause).toHaveBeenCalledWith({ pausedUntil: null });
    await user.click(weekly);
    expect(actions.saveAvailability).toHaveBeenCalledTimes(1);
    expect(actions.saveSettings).toHaveBeenCalledTimes(1);
    expect(actions.setPause).toHaveBeenCalledTimes(1);
  });
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
    await user.click(screen.getByRole('button', { name: 'Haftalık saatleri kaydet' }));
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
    await user.click(screen.getByRole('button', { name: 'Haftalık saatleri kaydet' }));
    expect(actions.saveAvailability).not.toHaveBeenCalled();
    expect(within(monday).getByText('Aynı gündeki aralıklar çakışamaz.')).toBeInTheDocument();
    const ends = within(monday).getAllByLabelText('Bitiş');
    await user.clear(ends[0]!);
    await user.type(ends[0]!, '08:00');
    await user.click(screen.getByRole('button', { name: 'Haftalık saatleri kaydet' }));
    expect(within(monday).getByText('Bitiş, başlangıçtan sonra olmalı.')).toBeInTheDocument();
  });

  it('yüz yüze seçilince yer notu zorunlu; geçersiz kapasite alan hatası verir', async () => {
    const actions = settingsActions();
    const { user } = renderUi(<MentorSettings initial={settingsView()} actions={actions} />);
    await user.click(screen.getByRole('checkbox', { name: 'Yüz yüze' }));
    await user.click(screen.getByRole('button', { name: 'Genel ayarları kaydet' }));
    expect(actions.saveSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Yüz yüze için yer notu yaz.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Yüz yüze görüşme yeri/), 'Kampüs kafe');
    await user.clear(screen.getByLabelText(/Aylık görüşme kapasitesi/));
    await user.type(screen.getByLabelText(/Aylık görüşme kapasitesi/), '99');
    await user.click(screen.getByRole('button', { name: 'Genel ayarları kaydet' }));
    expect(screen.getByText('1 ile 40 arasında bir sayı gir.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Aylık görüşme kapasitesi/));
    await user.type(screen.getByLabelText(/Aylık görüşme kapasitesi/), '5');
    await user.click(screen.getByRole('button', { name: 'Genel ayarları kaydet' }));
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
    await user.click(screen.getByRole('button', { name: 'Ara verme durumunu kaydet' }));
    expect(actions.setPause).not.toHaveBeenCalled();
    expect(screen.getByText('Geçerli bir tarih seç.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Şu tarihe kadar/), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Ara verme durumunu kaydet' }));
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

/** Çizelge satırının okunan metni (baştaki işaret rakamı aria-hidden'dır, atılır). */
const stepText = (item: HTMLElement) => item.textContent!.replace(/^\d+/, '');

describe('randevu detayı', () => {
  it('onaylı geçmiş görüşmede form açılmışsa geri bildirim tek birincildir, Meet bağlantısı ikincildir', () => {
    renderUi(
      <AppointmentDetail
        appointment={view(
          { status: 'CONFIRMED', meetUrl: 'https://meet.example.com/feedback' },
          { canConfirm: false, canDecline: false, canCancel: false, canDownloadIcs: true },
        )}
        feedbackAvailable
        actions={detailActions()}
      />,
    );
    expect(screen.getByRole('link', { name: 'Formu doldur' })).toHaveClass('bg-primary');
    expect(screen.getByRole('link', { name: 'Görüşmeye katıl' })).not.toHaveClass('bg-primary');
    expect(
      screen.getByText('Görüşme nasıl geçti? Kısa bir geri bildirim bırakabilirsin.'),
    ).toBeVisible();
  });
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

  it('zaman çizelgesi randevunun yolunu gösterir: şu anki adım işaretli, durum metni okunur', () => {
    renderUi(<AppointmentDetail appointment={view()} actions={detailActions()} />);
    const path = screen.getByRole('list', { name: 'Randevu yolu' });
    const items = within(path).getAllByRole('listitem');
    expect(items.map(stepText)).toEqual([
      'Talep (şu an burada)',
      'Mentor onayı (sırada)',
      'Görüşme (sırada)',
      'Geri bildirim (sırada)',
    ]);
    expect(items[0]).toHaveAttribute('aria-current', 'step');
    expect(items.filter((item) => item.hasAttribute('aria-current'))).toHaveLength(1);
    expect(screen.getByText('Bu talebe yanıt vermeni bekliyoruz.')).toBeInTheDocument();
  });

  it('talep eden için çizelge altındaki cümle yanıtın beklendiğini söyler', () => {
    renderUi(
      <AppointmentDetail appointment={view({ role: 'MENTEE' })} actions={detailActions()} />,
    );
    expect(screen.getByText('Talebin mentora iletildi; yanıtını bekliyoruz.')).toBeInTheDocument();
  });

  it('tamamlanan randevuda doldurulacak geri bildirim varsa son adım şu andır ve cümle çağırır', () => {
    renderUi(
      <AppointmentDetail
        appointment={view(
          { status: 'COMPLETED', role: 'MENTEE' },
          { canConfirm: false, canDecline: false },
        )}
        feedbackAvailable
        actions={detailActions()}
      />,
    );
    const items = within(screen.getByRole('list', { name: 'Randevu yolu' })).getAllByRole(
      'listitem',
    );
    expect(stepText(items[3]!)).toBe('Geri bildirim (şu an burada)');
    expect(
      screen.getByText('Görüşme nasıl geçti? Kısa bir geri bildirim bırakabilirsin.'),
    ).toBeInTheDocument();
  });

  it('reddedilen talepte çizelge orada durur, sonraki adımlar gösterilmez', () => {
    renderUi(
      <AppointmentDetail
        appointment={view(
          { status: 'DECLINED', cancelledBy: 'MENTOR' },
          { canConfirm: false, canDecline: false },
        )}
        actions={detailActions()}
      />,
    );
    const path = screen.getByRole('list', { name: 'Randevu yolu' });
    expect(within(path).getAllByRole('listitem').map(stepText)).toEqual([
      'Talep (tamamlandı)',
      'Mentor reddetti (burada durdu)',
    ]);
    expect(within(path).queryByText(/Görüşme/)).not.toBeInTheDocument();
  });

  it('onaylı online randevuda Meet bağlantısı bilgi kartından ÖNCE gelir ve tek birincil eylemdir', () => {
    renderUi(
      <AppointmentDetail
        appointment={view(
          {
            status: 'CONFIRMED',
            meetUrl: 'https://meet.google.com/abc-defg-hij',
            decidedAt: new Date('2026-11-08T07:00:00Z'),
            expiresAt: null,
          },
          { canConfirm: false, canDecline: false, canCancel: true, canDownloadIcs: true },
        )}
        actions={detailActions()}
      />,
    );
    const join = screen.getByRole('link', { name: 'Görüşmeye katıl' });
    const when = screen.getByText('Zaman');
    expect(join.compareDocumentPosition(when) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Diğer eylemler ikincil: takvim bağlantısı ve iptal birincil değildir.
    const ics = screen.getByRole('link', { name: 'Takvime ekle (.ics)' });
    expect(join.className).not.toBe(ics.className);
    expect(screen.getByRole('button', { name: 'Randevuyu iptal et' })).toBeInTheDocument();
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

  it('geniş ekranda (xl) kapsayıcı genişler ve kartlar iki sütun; telefon ve tablet sütunu aynı kalır', () => {
    renderUi(
      <MyAppointments
        initial={page([view(), view({ id: 'a2' })])}
        initialRole="MENTOR"
        showSettings={false}
        list={vi.fn()}
      />,
    );

    const container = screen.getByRole('heading', { level: 1 }).closest('.max-w-lg');
    // 1920'de 1664 px ana alanda 512 px'lik sütun kalıyordu (%31); ≥1280 px'te genişler, altı (390/768) değişmez.
    expect(container).toHaveClass('max-w-lg', 'xl:max-w-5xl');
    const list = screen.getAllByRole('listitem')[0]!.parentElement;
    expect(list).toHaveClass('flex', 'flex-col', 'xl:grid', 'xl:grid-cols-2');
    // Ekran genişliği ayrımı yalnız xl: daha küçük bir kırılma (md/lg) tablet sütununu bozardı.
    expect(container!.className).not.toMatch(/\b(?:md|lg|sm):max-w-/);
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

  it('dizinde hiç mentor yokken boş Giden durumu "Mentor bul" ile boş sayfaya göndermez: deneyimlere yönlendirir', () => {
    renderUi(
      <MyAppointments
        initial={page([])}
        initialRole="MENTEE"
        showSettings={false}
        mentorsAvailable={false}
        list={vi.fn()}
      />,
    );
    expect(screen.getByText('Henüz mentor listelenmiyor')).toBeInTheDocument();
    expect(screen.queryByText('Henüz randevu istemedin')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mentor bul' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deneyimlere bak' })).toHaveAttribute(
      'href',
      '/deneyimler',
    );
  });

  it('mentor varken (varsayılan) Giden boş durumu bugünkü gibi "Mentor bul" der', () => {
    renderUi(
      <MyAppointments
        initial={page([])}
        initialRole="MENTEE"
        showSettings={false}
        list={vi.fn()}
      />,
    );
    expect(screen.getByText('Henüz randevu istemedin')).toBeInTheDocument();
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
  await user.click(screen.getByRole('button', { name: 'Haftalık saatleri kaydet' }));
  expect(actions.saveAvailability).toHaveBeenCalledWith({
    rules: [{ weekday: 7, startMinute: 1380, endMinute: 1440, mode: null }],
  });
});

import Link from 'next/link';
// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUi } from '@/test/render';
import type { AppointmentView } from '@/contracts/appointment';
import type { HomeDashboardProps } from './dashboard';
import { HomeDashboard } from './dashboard';
import { HomeStoryBand, type HomePanels } from './widgets';

const now = new Date('2026-11-16T18:00:00Z');
const base: HomeDashboardProps['summary'] = {
  firstName: 'Mert',
  role: 'STUDENT',
  pending: {
    contactRequests: 0,
    cvReviewsToAnswer: 0,
    cvReviewsToRate: 0,
    feedbackForms: 0,
    appointmentRequests: 0,
  },
  adminPending: null,
};
const panels = (): HomePanels => ({
  completion: { percent: 60, missing: ['GOALS', 'VISIBILITY'] },
  appointments: { ok: true, data: { items: [], nextCursor: null } },
  mentors: { ok: true, data: { items: [] } },
  jobs: { ok: true, data: [] },
  settings: { ok: true, data: { eligible: false, settings: null, rules: [] } },
});
const show = (props: Partial<HomeDashboardProps> = {}) =>
  renderUi(<HomeDashboard summary={base} panels={panels()} now={now} {...props} />);
const actions = () => within(screen.getByRole('navigation', { name: 'Ana sayfa eylemleri' }));
const appointment = (over: Partial<AppointmentView> = {}): AppointmentView => ({
  id: 'appt1',
  status: 'CONFIRMED',
  role: 'MENTEE',
  counterpart: { userId: 'mentor1', displayName: 'Bir Mentor' },
  startsAt: new Date('2026-11-17T07:00:00Z'),
  endsAt: new Date('2026-11-17T07:20:00Z'),
  mode: 'ONLINE',
  note: null,
  location: null,
  meetUrl: null,
  linkNeeded: true,
  expiresAt: null,
  decidedAt: now,
  cancelledBy: null,
  cancelReason: null,
  createdAt: now,
  actions: {
    canConfirm: false,
    confirmBlockedReason: null,
    canDecline: false,
    canCancel: true,
    canSetLink: false,
    canDownloadIcs: true,
  },
  ...over,
});

describe('A görünümü kişisel pano', () => {
  it('İstanbul saatinde karşılar, gerçek yüzdeyi ve eksik adımları gösterir; başvuru sayısı uydurmaz', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'İyi akşamlar, Mert' })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Profil hazırlığı' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
    expect(screen.getByRole('region', { name: 'Profilin' })).toHaveTextContent('Hedeflerin');
    expect(screen.getByRole('region', { name: 'Profilin' })).toHaveTextContent(
      'Gizlilik tercihlerin',
    );
    expect(actions().getByRole('link', { name: 'CV’den profilini doldur' })).toHaveAttribute(
      'href',
      '/profil/cv',
    );
    expect(screen.queryByText(/Başvurular/)).toBeNull();
  });
  it('profil tamamlanınca CV eylemi kalkar; baş eylem mentor dizinine gider', () => {
    show({ panels: { ...panels(), completion: { percent: 100, missing: [] } } });
    expect(actions().queryByRole('link', { name: 'CV’den profilini doldur' })).toBeNull();
    expect(actions().getByRole('link', { name: 'Mentor bul' })).toHaveAttribute(
      'href',
      '/mentorlar',
    );
    expect(screen.getByText('Başlangıç tercihlerin tamam.')).toBeVisible();
  });
  it('boş pilotta görüşme/ilan/mentor önerisi durumları ve rol kısayolları korunur', () => {
    show();
    expect(screen.getByText('Henüz planlanmış görüşmen yok.')).toBeVisible();
    expect(screen.getByText('İlan önerilerini burada göreceksin')).toBeVisible();
    expect(screen.getByText('Henüz mentor önerin yok')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Bekleyen işlerin' })).toHaveTextContent(
      'Şu an bekleyen bir işin yok.',
    );
    const shortcuts = within(screen.getByRole('region', { name: 'Kısayollar' }));
    expect(shortcuts.getByRole('link', { name: /CV incelemesi/ })).toHaveAttribute(
      'href',
      '/hesap/cv-inceleme',
    );
    expect(screen.queryByRole('region', { name: 'Ayın mezunu' })).toBeNull();
  });
  it('hata alınan kutu veri yokmuş gibi gösterilmez', () => {
    show({
      panels: {
        ...panels(),
        completion: null,
        appointments: { ok: false, errorCode: 'SERVER_UNEXPECTED' },
        jobs: { ok: false, errorCode: 'SERVER_UNEXPECTED' },
        mentors: { ok: false, errorCode: 'SERVER_UNEXPECTED' },
      },
    });
    expect(screen.queryByText('Henüz planlanmış görüşmen yok.')).toBeNull();
    expect(screen.queryByText('Henüz mentor önerin yok')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(4);
    expect(actions().queryByRole('link', { name: 'CV’den profilini doldur' })).toBeNull();
  });
  it('sıfır olmayan bekleyen işler sayılarıyla kendi sayfalarına bağlanır', () => {
    show({
      summary: { ...base, pending: { ...base.pending, contactRequests: 2, feedbackForms: 1 } },
    });
    expect(screen.getByText('Seni bekleyen 3 iş var.')).toBeVisible();
    const pending = within(screen.getByRole('region', { name: 'Bekleyen işlerin' }));
    expect(pending.getByRole('link', { name: /2 iletişim talebi/ })).toHaveAttribute(
      'href',
      '/hesap/iletisim',
    );
    expect(pending.getByRole('link', { name: /1 görüşme formu/ })).toHaveAttribute(
      'href',
      '/hesap/gorusmeler',
    );
    expect(pending.getAllByRole('link')).toHaveLength(2);
  });
  it('geçmiş görüşmeyi atlar, ilk gelecekteki onaylı görüşmeyi ve izinli takvim indirmesini gösterir', () => {
    const next = appointment();
    show({
      panels: {
        ...panels(),
        appointments: {
          ok: true,
          data: {
            items: [
              appointment({
                id: 'past',
                counterpart: { userId: 'past-user', displayName: 'Geçmiş Kişi' },
                startsAt: new Date('2026-10-01T07:00Z'),
              }),
              next,
            ],
            nextCursor: null,
          },
        },
      },
    });
    const region = within(screen.getByRole('region', { name: 'Yaklaşan görüşme' }));
    expect(region.getByRole('heading', { name: 'Bir Mentor ile görüşme' })).toBeVisible();
    expect(region.getByRole('link', { name: 'Görüşmeyi aç' })).toHaveAttribute(
      'href',
      '/randevular/appt1',
    );
    expect(region.getByRole('link', { name: 'Takvime ekle' })).toHaveAttribute(
      'href',
      '/api/randevu/appt1/ics',
    );
    expect(screen.queryByText(/Geçmiş Kişi/)).toBeNull();
  });
  it('onaylı görüşmede takvim izni yoksa indirme bağlantısı oluşmaz', () => {
    const a = appointment();
    show({
      panels: {
        ...panels(),
        appointments: {
          ok: true,
          data: {
            items: [{ ...a, actions: { ...a.actions, canDownloadIcs: false } }],
            nextCursor: null,
          },
        },
      },
    });
    expect(screen.queryByRole('link', { name: 'Takvime ekle' })).toBeNull();
  });
  it('mentor gerçek kapasitesini ve gelen talepleri görür; öğrenciye özel ilan/mentor önerileri yoktur', () => {
    show({
      summary: {
        ...base,
        role: 'MENTOR',
        pending: { ...base.pending, appointmentRequests: 3, cvReviewsToAnswer: 1 },
      },
      panels: {
        ...panels(),
        settings: {
          ok: true,
          data: {
            eligible: true,
            settings: {
              monthlyCapacity: 7,
              sessionMinutes: 20,
              meetingModes: ['ONLINE'],
              inPersonNote: null,
              isActive: true,
              pausedUntil: null,
            },
            rules: [],
          },
        },
      },
    });
    expect(actions().getByRole('link', { name: 'Gelen talepleri gör' })).toHaveAttribute(
      'href',
      '/randevular',
    );
    expect(screen.getByRole('region', { name: 'Bu ayki kapasiten' })).toHaveTextContent('7');
    expect(screen.queryByRole('region', { name: 'Sana uygun ilanlar' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Mentorlar' })).toBeNull();
    expect(
      within(screen.getByRole('region', { name: 'Kısayollar' })).getByRole('link', {
        name: /CV incelemeleri/,
      }),
    ).toHaveAttribute('href', '/hesap/cv-inceleme');
  });
  it('mentor olmayan yönetici yanlış mentor ayarına gönderilmez; yönetim sayısı korunur', () => {
    show({ summary: { ...base, role: 'MENTOR', adminPending: 4 } });
    expect(actions().getByRole('link', { name: 'İncelemelere git' })).toHaveAttribute(
      'href',
      '/yonetim',
    );
    expect(screen.getByText('4 iş inceleme bekliyor')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Bu ayki kapasiten' })).toBeNull();
  });
  it('ilan ve mentor satırları yalnız sunucudaki önerileri, gerçek rotaları ve kamusal adları kullanır', () => {
    show({
      panels: {
        ...panels(),
        jobs: {
          ok: true,
          data: [{ id: 'job1', title: 'Bir Staj', organizationName: 'Örnek Kurum' }],
        },
        mentors: {
          ok: true,
          data: {
            items: [
              {
                reasons: [],
                mentor: {
                  userId: 'm1',
                  displayName: 'Önerilen Mentor',
                  headline: null,
                  mentorType: 'ALUMNI',
                  departmentName: 'YBS',
                  graduationYear: null,
                  position: null,
                  sectorName: null,
                  topics: [],
                  skills: [],
                  availability: { available: true, reason: null, pausedUntil: null },
                  capacity: { monthly: 3, used: 1, remaining: 2 },
                  sessionMinutes: 20,
                  meetingModes: ['ONLINE'],
                  cvReviewEnabled: false,
                },
              },
            ],
          },
        },
      },
    });
    expect(screen.getByRole('link', { name: /Bir Staj/ })).toHaveAttribute('href', '/ilanlar/job1');
    expect(screen.getByRole('link', { name: /Önerilen Mentor/ })).toHaveAttribute(
      'href',
      '/uye/m1',
    );
  });
  it('bildirim ve hikâye başlıktan sonra gelir; telefonun okuma sırası ızgaradan bağımsızdır', () => {
    show({
      notice: <Link href="/baslangic">Başlangıca devam et</Link>,
      feature: <Link href="/hikayeler">Hikâye arşivi</Link>,
    });
    const elements = [
      screen.getByRole('heading', { level: 1 }),
      screen.getByRole('link', { name: 'Başlangıca devam et' }),
      screen.getByRole('region', { name: 'Yaklaşan görüşme' }),
      screen.getByRole('region', { name: 'Profilin' }),
      screen.getByRole('region', { name: 'Sana uygun ilanlar' }),
      screen.getByRole('region', { name: 'Mentorlar' }),
      screen.getByRole('link', { name: 'Hikâye arşivi' }),
      screen.getByRole('region', { name: 'Kısayollar' }),
    ];
    for (let i = 1; i < elements.length; i++)
      expect(
        elements[i - 1]!.compareDocumentPosition(elements[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
  });
  it('ad boşsa selamda virgül/boş ad bırakmaz', () => {
    show({ summary: { ...base, firstName: '' } });
    expect(screen.getByRole('heading', { level: 1, name: 'İyi akşamlar' })).toBeVisible();
  });
  it('hikâye bandı görünür rızalı veriyi metin olarak çizer, ayrıntı kimliğini kaçırır', () => {
    renderUi(
      <HomeStoryBand
        story={{
          id: 'x/y',
          name: 'Mezun',
          department: 'YBS',
          month: '2026-11',
          body: '<img src=x onerror=alert(1)> Bir hikâye.',
        }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Hikâyeyi oku' })).toHaveAttribute(
      'href',
      '/hikayeler/x%2Fy',
    );
    expect(screen.getByText('<img src=x onerror=alert(1)> Bir hikâye.')).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
  });
  it('hikâye bandı "Ayın mezunu" bölgesi ve başlığıdır (e2e ve yönetim ekranıyla aynı ad)', () => {
    renderUi(
      <HomeStoryBand
        story={{ id: 's1', name: 'Mezun', department: 'YBS', month: '2026-11', body: 'Hikâye.' }}
      />,
    );
    const region = screen.getByRole('region', { name: 'Ayın mezunu' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Ayın mezunu' })).toBeVisible();
  });
  it('sıradaki görüşme geçmişi atlar, ilk yaklaşan olandır; yüzde işareti ve kapasite kutusu rolüne göre', () => {
    const past = appointment({
      id: 'past',
      counterpart: { userId: 'm0', displayName: 'Geçmiş Mentor' },
      startsAt: new Date('2026-11-15T07:00:00Z'),
      endsAt: new Date('2026-11-15T07:20:00Z'),
    });
    const first = appointment({
      id: 'first',
      counterpart: { userId: 'm1', displayName: 'Birinci Mentor' },
    });
    const second = appointment({
      id: 'second',
      counterpart: { userId: 'm2', displayName: 'İkinci Mentor' },
      startsAt: new Date('2026-11-18T07:00:00Z'),
      endsAt: new Date('2026-11-18T07:20:00Z'),
    });
    show({
      panels: {
        ...panels(),
        appointments: { ok: true, data: { items: [past, first, second], nextCursor: null } },
      },
    });
    const stats = within(screen.getByLabelText('Günün özeti'));
    expect(stats.getByText('17 Kas')).toBeVisible();
    expect(stats.queryByText('15 Kas')).toBeNull();
    expect(stats.queryByText('18 Kas')).toBeNull();
    const upcoming = within(screen.getByRole('region', { name: 'Yaklaşan görüşme' }));
    expect(
      upcoming.getByRole('heading', { level: 3, name: 'Birinci Mentor ile görüşme' }),
    ).toBeVisible();
    expect(upcoming.queryByText(/Geçmiş Mentor/)).toBeNull();
    expect(upcoming.getByText(/Sonra:.*İkinci Mentor/)).toBeVisible();
    expect(stats.getByText('%60')).toBeVisible();
    // Öğrenci kapasite kutusu görmez.
    expect(screen.queryByRole('region', { name: 'Bu ayki kapasiten' })).toBeNull();
  });
});

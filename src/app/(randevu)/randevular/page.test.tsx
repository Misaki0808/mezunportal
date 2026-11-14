import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMyMentorSettings: vi.fn(),
  listMyAppointments: vi.fn(),
  searchMentors: vi.fn(),
}));
vi.mock('@/server/actions/appointment', () => ({
  getMyMentorSettings: mocks.getMyMentorSettings,
  listMyAppointments: mocks.listMyAppointments,
}));
vi.mock('@/server/actions/mentor-directory', () => ({ searchMentors: mocks.searchMentors }));
vi.mock('@/components/appointments/my-appointments', () => ({ MyAppointments: () => null }));

import { MyAppointments } from '@/components/appointments/my-appointments';
import MyAppointmentsPage from './page';

type Node = { type: unknown; props: Record<string, unknown> };

async function pageProps() {
  const node = (await MyAppointmentsPage()) as unknown as Node;
  expect(node.type).toBe(MyAppointments);
  return node.props;
}

const directory = (total: number) => ({
  ok: true,
  data: { items: [], total, page: 1, pageSize: 10 },
});

describe('/randevular: boş "Giden" durumunun hedefi (mentorsAvailable) ve rol bağlama', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getMyMentorSettings.mockResolvedValue({ ok: true, data: { eligible: false } });
    mocks.listMyAppointments.mockResolvedValue({
      ok: true,
      data: { items: [], nextCursor: null },
    });
  });

  it('dizinde mentor yoksa "Mentor bul" boş sayfaya göndermesin: mentorsAvailable=false', async () => {
    mocks.searchMentors.mockResolvedValue(directory(0));
    expect((await pageProps()).mentorsAvailable).toBe(false);
  });

  it('dizinde mentor varsa bugünkü "Mentor bul" kalır', async () => {
    mocks.searchMentors.mockResolvedValue(directory(3));
    expect((await pageProps()).mentorsAvailable).toBe(true);
  });

  it('dizin okunamazsa (hata sonucu ya da istisna) güvenli varsayılan: "Mentor bul"', async () => {
    mocks.searchMentors.mockResolvedValueOnce({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    expect((await pageProps()).mentorsAvailable).toBe(true);
    mocks.searchMentors.mockRejectedValueOnce(new Error('db'));
    expect((await pageProps()).mentorsAvailable).toBe(true);
  });

  it('mentor olabilen kullanıcı gelen talepler rolüyle ve ayar bağlantısıyla açılır, diğerleri giden rolüyle', async () => {
    mocks.searchMentors.mockResolvedValue(directory(1));
    mocks.getMyMentorSettings.mockResolvedValue({ ok: true, data: { eligible: true } });
    expect(await pageProps()).toMatchObject({ initialRole: 'MENTOR', showSettings: true });
    expect(mocks.listMyAppointments).toHaveBeenLastCalledWith({ role: 'MENTOR' });
    mocks.getMyMentorSettings.mockResolvedValue({ ok: true, data: { eligible: false } });
    expect(await pageProps()).toMatchObject({ initialRole: 'MENTEE', showSettings: false });
    expect(mocks.listMyAppointments).toHaveBeenLastCalledWith({ role: 'MENTEE' });
  });
});

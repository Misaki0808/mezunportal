import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchMentors: vi.fn(),
  getSimilarMentors: vi.fn(),
  getMyMentorSettings: vi.fn(),
  listSearchSectors: vi.fn(),
}));
vi.mock('@/server/actions/mentor-directory', () => ({
  searchMentors: mocks.searchMentors,
  getSimilarMentors: mocks.getSimilarMentors,
}));
vi.mock('@/server/actions/appointment', () => ({ getMyMentorSettings: mocks.getMyMentorSettings }));
vi.mock('@/server/actions/search', () => ({ listSearchSectors: mocks.listSearchSectors }));
vi.mock('@/components/privacy/server-guard', () => ({ PrivacyGuard: () => null }));
vi.mock('@/components/mentors/mentor-directory', () => ({ MentorDirectory: () => null }));

import { MentorDirectory } from '@/components/mentors/mentor-directory';
import MentorsPage from './page';

type Node = { type: unknown; props: Record<string, unknown> };

/** Sayfanın asıl bileşenini (Results) çağırıp dizine verdiği özellikleri okur; çizim gerekmez. */
async function directoryProps(params: Record<string, string> = {}) {
  const guard = (await MentorsPage({ searchParams: Promise.resolve(params) })) as unknown as Node;
  const results = guard.props.children as Node;
  const directory = (await (results.type as (props: unknown) => Promise<Node>)(
    results.props,
  )) as Node;
  expect(directory.type).toBe(MentorDirectory);
  return directory.props;
}

const mine = (eligible: boolean, settings: { isActive: boolean } | null) => ({
  ok: true,
  data: { eligible, settings },
});

describe('/mentorlar: boş dizinde mentorluğu açma eylemi (canOpenMentoring)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.searchMentors.mockResolvedValue({
      ok: true,
      data: { items: [], total: 0, page: 1, pageSize: 10 },
    });
    mocks.getSimilarMentors.mockResolvedValue({ ok: true, data: { items: [] } });
    mocks.listSearchSectors.mockResolvedValue({ ok: true, data: { sectors: [] } });
  });

  it('mentor olabilen ve profili kapalı kullanıcıya açılır', async () => {
    mocks.getMyMentorSettings.mockResolvedValue(mine(true, { isActive: false }));
    expect((await directoryProps()).canOpenMentoring).toBe(true);
  });

  it('mentor olabilen ve hiç ayar kaydetmemiş kullanıcıya da açılır (ayar satırı yok)', async () => {
    mocks.getMyMentorSettings.mockResolvedValue(mine(true, null));
    expect((await directoryProps()).canOpenMentoring).toBe(true);
  });

  it('profili zaten açık mentora önerilmez', async () => {
    mocks.getMyMentorSettings.mockResolvedValue(mine(true, { isActive: true }));
    expect((await directoryProps()).canOpenMentoring).toBe(false);
  });

  it('mentor olamayan rol (öğrenci) için kapalıdır', async () => {
    mocks.getMyMentorSettings.mockResolvedValue(mine(false, null));
    expect((await directoryProps()).canOpenMentoring).toBe(false);
  });

  it('ayarlar okunamazsa (hata sonucu ya da istisna) eylem çıkmaz, sayfa yine açılır', async () => {
    mocks.getMyMentorSettings.mockResolvedValueOnce({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
    expect((await directoryProps()).canOpenMentoring).toBe(false);
    mocks.getMyMentorSettings.mockRejectedValueOnce(new Error('db'));
    expect((await directoryProps()).canOpenMentoring).toBe(false);
  });
});

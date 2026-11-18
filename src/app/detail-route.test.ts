import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  path: '',
  load: vi.fn(),
  listPostings: vi.fn(),
  ownMonth: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-mezun-path': mocks.path }),
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/server/actions/appointment', () => ({
  getAppointment: mocks.load,
  listSlots: mocks.load,
}));
vi.mock('@/server/actions/alumni-story', () => ({ getPublishedStory: mocks.load }));
vi.mock('@/server/actions/profile-content', () => ({ getProfile: mocks.load }));
vi.mock('@/server/actions/job-postings', () => ({
  getJobPosting: mocks.load,
  listMyJobPostings: mocks.listPostings,
}));
vi.mock('@/server/actions/experience', () => ({
  getExperienceDetail: mocks.load,
  getOwnAppliedMonth: mocks.ownMonth,
}));
vi.mock('@/server/actions/faq', () => ({ getFaqItem: mocks.load }));
vi.mock('@/server/actions/companies', () => ({ getCompany: mocks.load }));
import { rejectMissingDetail } from './detail-route';

beforeEach(() => {
  mocks.path = '';
  mocks.load.mockReset();
  mocks.listPostings.mockReset();
  mocks.ownMonth.mockReset();
  mocks.notFound.mockClear();
});
describe('ayrıntı 404 ön denetimi', () => {
  it.each([
    ['appointment', '/randevular/abc', { appointmentId: 'abc' }],
    ['appointment', '/randevu-al/abc', { mentorId: 'abc' }],
    ['profile', '/hikayeler/abc', { storyId: 'abc' }],
    ['profile', '/uye/abc', { userId: 'abc' }],
    ['posting', '/ilanlar/abc', { id: 'abc' }],
    ['experience', '/deneyim/abc', { experienceId: 'abc' }],
    ['faq', '/sss/abc', { id: 'abc' }],
    ['posting', '/sirketler/ornek', { slug: 'ornek' }],
  ] as const)('%s %s yetkili servis yok derse 404', async (group, path, argument) => {
    mocks.path = path;
    mocks.load.mockResolvedValue({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
    await expect(rejectMissingDetail(group)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.load).toHaveBeenCalledWith(argument);
  });
  it('başka alt yollar ve yetki dışındaki hatalar 404 sayılmaz', async () => {
    mocks.path = '/ilanlar/abc/iletisim';
    await rejectMissingDetail('posting');
    expect(mocks.load).not.toHaveBeenCalled();
    mocks.path = '/ilanlar/abc';
    mocks.load.mockResolvedValue({ ok: false, errorCode: 'DB_UNAVAILABLE' });
    await rejectMissingDetail('posting');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
  it('ilan düzenlemede bütün kendi sayfaları aranır, bulunmayan 404; sunucu hatası 404 değildir', async () => {
    mocks.path = '/ilanlar/abc/duzenle';
    mocks.listPostings
      .mockResolvedValueOnce({ ok: true, data: { items: [], nextCursor: 'next' } })
      .mockResolvedValueOnce({ ok: true, data: { items: [{ id: 'abc' }], nextCursor: null } });
    await rejectMissingDetail('posting');
    expect(mocks.listPostings).toHaveBeenNthCalledWith(2, { cursor: 'next', limit: 50 });
    mocks.listPostings.mockResolvedValueOnce({ ok: true, data: { items: [], nextCursor: null } });
    await expect(rejectMissingDetail('posting')).rejects.toThrow('NEXT_NOT_FOUND');
    mocks.notFound.mockClear();
    mocks.listPostings.mockResolvedValueOnce({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    await rejectMissingDetail('posting');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
  it('deneyim taslağında okuma yetkisi tek başına düzenleme yetkisi vermez', async () => {
    mocks.path = '/deneyim/abc/duzenle';
    mocks.load.mockResolvedValue({ ok: true, data: { status: 'DRAFT' } });
    mocks.ownMonth.mockResolvedValueOnce({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
    await expect(rejectMissingDetail('experience')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.load).not.toHaveBeenCalled();
    mocks.notFound.mockClear();
    mocks.ownMonth.mockResolvedValueOnce({ ok: true, data: { appliedMonth: null } });
    await rejectMissingDetail('experience');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
  it('yayınlı deneyim herkese okunabilir olsa da yabancı düzenlemesi 404, sahibin durumu korunur', async () => {
    mocks.path = '/deneyim/abc/duzenle';
    mocks.load.mockResolvedValue({ ok: true, data: { status: 'PUBLISHED' } });
    mocks.ownMonth.mockResolvedValueOnce({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
    await expect(rejectMissingDetail('experience')).rejects.toThrow('NEXT_NOT_FOUND');
    mocks.notFound.mockClear();
    mocks.ownMonth.mockResolvedValueOnce({ ok: false, errorCode: 'EXPERIENCE_NOT_EDITABLE' });
    await rejectMissingDetail('experience');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
  it.each([
    ['posting', '/ilanlar/yeni'],
    ['experience', '/deneyim/yeni'],
  ] as const)('%s yeni formunu ayrıntı sanmaz', async (group, path) => {
    mocks.path = path;
    await rejectMissingDetail(group);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('yetkisiz kayıt 404, görünür kayıt normal sonuçtur', async () => {
    mocks.path = '/deneyim/abc';
    mocks.load.mockResolvedValueOnce({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
    await expect(rejectMissingDetail('experience')).rejects.toThrow('NEXT_NOT_FOUND');
    mocks.notFound.mockClear();
    mocks.load.mockResolvedValueOnce({ ok: true, data: {} });
    await rejectMissingDetail('experience');
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
  it.each([
    ['faq', '/sss/abc'],
    ['posting', '/sirketler/ornek'],
  ] as const)('%s rol reddini 404 yerine sayfanın kendi uyarısına bırakır', async (group, path) => {
    mocks.path = path;
    mocks.load.mockResolvedValue({ ok: false, errorCode: 'AUTH_FORBIDDEN' });
    await rejectMissingDetail(group);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});

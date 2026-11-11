import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  path: '',
  load: vi.fn(),
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
vi.mock('@/server/actions/job-postings', () => ({ getJobPosting: mocks.load }));
vi.mock('@/server/actions/experience', () => ({ getExperienceDetail: mocks.load }));
import { rejectMissingDetail } from './detail-route';

beforeEach(() => {
  mocks.path = '';
  mocks.load.mockReset();
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
  ] as const)('%s %s yetkili servis yok derse 404', async (group, path, argument) => {
    mocks.path = path;
    mocks.load.mockResolvedValue({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
    await expect(rejectMissingDetail(group)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.load).toHaveBeenCalledWith(argument);
  });
  it('başka alt yollar ve yetki dışındaki hatalar 404 sayılmaz', async () => {
    mocks.path = '/ilanlar/abc/duzenle';
    await rejectMissingDetail('posting');
    expect(mocks.load).not.toHaveBeenCalled();
    mocks.path = '/ilanlar/abc';
    mocks.load.mockResolvedValue({ ok: false, errorCode: 'DB_UNAVAILABLE' });
    await rejectMissingDetail('posting');
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
});

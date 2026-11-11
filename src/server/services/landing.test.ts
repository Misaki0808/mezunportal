import { describe, expect, it, vi } from 'vitest';

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('@/server/db', () => ({ getDb }));
import { getLandingStats, publicLandingCount } from './landing';

describe('herkese açık tanıtım sayıları', () => {
  it('küçük grupları ve geçersiz değerleri sayı olarak açmaz', () => {
    for (const count of [0, 1, 2, -1, 1.2, NaN]) expect(publicLandingCount(count)).toBeNull();
    expect(publicLandingCount(3)).toBe(3);
  });
  it('yalnız yayınlanan, aktif ve tamamlanan toplamları döndürür; hata halinde boş duruma döner', async () => {
    const experience = vi.fn().mockResolvedValue(2);
    const mentor = vi.fn().mockResolvedValue(3);
    const appointment = vi.fn().mockResolvedValue(10);
    const job = vi.fn().mockResolvedValue(5);
    const groups = vi.fn().mockResolvedValue([{ companyId: 'a' }, { companyId: 'b' }]);
    getDb.mockReturnValue({
      experience: { count: experience, groupBy: groups },
      mentorProfile: { count: mentor },
      appointment: { count: appointment },
      jobPosting: { count: job },
    });
    expect(await getLandingStats()).toEqual({
      available: true,
      experiences: null,
      mentors: 3,
      meetings: 10,
      jobs: 5,
      companies: null,
    });
    expect(experience).toHaveBeenCalledWith({ where: { status: 'PUBLISHED' } });
    expect(appointment).toHaveBeenCalledWith({ where: { status: 'COMPLETED' } });
    expect(job).toHaveBeenCalledWith({ where: { status: 'PUBLISHED' } });
    expect(groups).toHaveBeenCalledWith({
      by: ['companyId'],
      where: { status: 'PUBLISHED', companyId: { not: null } },
    });
    mentor.mockRejectedValue(new Error('unavailable'));
    expect(await getLandingStats()).toEqual({
      available: false,
      experiences: null,
      mentors: null,
      meetings: null,
      jobs: null,
      companies: null,
    });
  });
});

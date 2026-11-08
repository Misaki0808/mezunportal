import { describe, expect, it, vi } from 'vitest';
import type { ExperienceDetail, ExperiencePage } from '@/contracts/experience';
import { findAnonymousOwnership } from './anonymous-ownership';

const experience = (status: ExperienceDetail['status']) =>
  ({ id: 'target', status }) as ExperienceDetail;
const page = (ids: string[], nextCursor: string | null) => ({
  ok: true as const,
  data: { items: ids.map((id) => ({ id })), nextCursor } as ExperiencePage,
});

describe('anonim deneyim sahipliği', () => {
  it('ilk 50 kayıttan sonra da kendi yayınını bulur', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page(['other'], 'cursor'))
      .mockResolvedValueOnce(page(['target'], null));
    expect(await findAnonymousOwnership(experience('PUBLISHED'), list)).toBe(true);
    expect(list).toHaveBeenNthCalledWith(2, { status: 'PUBLISHED', limit: 50, cursor: 'cursor' });
  });
  it.each(['DRAFT', 'REJECTED'] as const)('%s durumunda da sahibi bulur', async (status) => {
    const list = vi.fn().mockResolvedValue(page(['target'], null));
    expect(await findAnonymousOwnership(experience(status), list)).toBe(true);
    expect(list).toHaveBeenCalledWith({ status, limit: 50 });
  });
  it('başkasının kaydını ve sorgu hatasını ayırır; döngüsel imleçte durur', async () => {
    expect(
      await findAnonymousOwnership(
        experience('PUBLISHED'),
        vi.fn().mockResolvedValue(page([], null)),
      ),
    ).toBe(false);
    expect(
      await findAnonymousOwnership(experience('PUBLISHED'), vi.fn().mockRejectedValue(new Error())),
    ).toBeNull();
    expect(
      await findAnonymousOwnership(
        experience('PUBLISHED'),
        vi.fn().mockResolvedValue(page([], 'repeat')),
      ),
    ).toBeNull();
  });
});

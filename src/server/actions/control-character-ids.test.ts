import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Liste ve eylem girişlerinde NUL'lu kimlik: kararlı `VALIDATION_INVALID`, servis/veritabanına hiç gidilmez (liste turu 2, BULGU-3). */
const mocks = vi.hoisted(() => ({
  story: { listStoryModeration: vi.fn(), reviewStory: vi.fn() },
  window: { getApplicationCalendar: vi.fn() },
}));
vi.mock('../permissions', () => ({
  requireAnyAdmin: vi.fn().mockResolvedValue({ userId: 'admin' }),
  requireVerifiedMember: vi.fn().mockResolvedValue({ userId: 'member' }),
}));
vi.mock('../db', () => ({ getDb: () => ({}) }));
vi.mock('../services/alumni-story', () => mocks.story);
vi.mock('../services/application-window', () => mocks.window);
vi.mock('../fail-action', async () => {
  const { actionFailure } = await import('@/lib/action-result');
  return { failAction: async (error: unknown) => actionFailure(error) };
});

import { getApplicationCalendar } from './application-window';
import { listStoryModeration, reviewStory } from './alumni-story';

beforeEach(() => vi.clearAllMocks());

describe('NUL içeren kimlik', () => {
  it('liste eylemi VALIDATION_INVALID döner, servise gitmez', async () => {
    const result = await listStoryModeration({ departmentId: '\u0000' });
    expect(result).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    expect(mocks.story.listStoryModeration).not.toHaveBeenCalled();
  });

  it('karar eylemi VALIDATION_INVALID döner, servise gitmez', async () => {
    const result = await reviewStory({ storyId: 'bir\u0000iki', decision: 'PUBLISH' });
    expect(result).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    expect(mocks.story.reviewStory).not.toHaveBeenCalled();
  });

  it('takvim eylemi VALIDATION_INVALID döner, servise gitmez', async () => {
    const result = await getApplicationCalendar({ kind: 'COMPANY', id: '\u0000' });
    expect(result).toMatchObject({ ok: false, errorCode: 'VALIDATION_INVALID' });
    expect(mocks.window.getApplicationCalendar).not.toHaveBeenCalled();
  });
});

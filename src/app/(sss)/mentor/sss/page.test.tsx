import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), settings: vi.fn() }));
vi.mock('@/server/actions/faq', () => ({
  listFaqRequestsForMentor: mocks.list,
  answerFaqRequest: vi.fn(),
}));
vi.mock('@/server/actions/appointment', () => ({ getMyMentorSettings: mocks.settings }));

import { MentorRequests } from '@/components/faq/mentor-requests';
import { MentorSetupNotice } from '@/components/faq/mentor-setup-notice';
import { ErrorState } from '@/components/ui';
import MentorFaqPage from './page';

const forbidden = { ok: false, errorCode: 'AUTH_FORBIDDEN' };
const view = (eligible: boolean, isActive: boolean | null) => ({
  ok: true,
  data: {
    eligible,
    rules: [],
    settings: isActive === null ? null : { isActive },
  },
});
beforeEach(() => {
  mocks.list.mockReset();
  mocks.settings.mockReset();
});

describe('mentor SSS sayfası', () => {
  it('etkin mentor profili olmayan ama mentor olabilen kullanıcıya ayara yönlendiren açıklama gösterilir', async () => {
    mocks.list.mockResolvedValue(forbidden);
    mocks.settings.mockResolvedValue(view(true, null));
    expect(((await MentorFaqPage()) as { type: unknown }).type).toBe(MentorSetupNotice);
  });

  it('profili var ama kapalıysa da aynı açıklama (ayarı açması gerekir)', async () => {
    mocks.list.mockResolvedValue(forbidden);
    mocks.settings.mockResolvedValue(view(true, false));
    expect(((await MentorFaqPage()) as { type: unknown }).type).toBe(MentorSetupNotice);
  });

  it('mentor olamayan kullanıcıya açıklama değil, gerçek rol reddi gösterilir', async () => {
    mocks.list.mockResolvedValue(forbidden);
    mocks.settings.mockResolvedValue(view(false, null));
    const page = (await MentorFaqPage()) as { type: unknown; props: { errorCode: string } };
    expect(page.type).toBe(ErrorState);
    expect(page.props.errorCode).toBe('AUTH_FORBIDDEN');
  });

  it('mentor ayarı okunamazsa güvenli tarafta kalır: rol reddi', async () => {
    mocks.list.mockResolvedValue(forbidden);
    mocks.settings.mockRejectedValue(new Error('db'));
    expect(((await MentorFaqPage()) as { type: unknown }).type).toBe(ErrorState);
  });

  it('başka bir hatada (oturum yok) ayara yönlendirmez ve ayarı sorgulamaz', async () => {
    mocks.list.mockResolvedValue({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
    const page = (await MentorFaqPage()) as { type: unknown; props: { errorCode: string } };
    expect(page.type).toBe(ErrorState);
    expect(page.props.errorCode).toBe('AUTH_UNAUTHENTICATED');
    expect(mocks.settings).not.toHaveBeenCalled();
  });

  it('etkin mentor kendi soru kutusunu görür', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: { items: [], nextCursor: null } });
    expect(((await MentorFaqPage()) as { type: unknown }).type).toBe(MentorRequests);
    expect(mocks.settings).not.toHaveBeenCalled();
  });
});

import { beforeEach, expect, it, vi } from 'vitest';
import { codedForbidden } from '@/lib/errors';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), invite: vi.fn() }));
vi.mock('../permissions', () => ({ requireAdmin: mocks.admin }));
vi.mock('../services/invitations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/invitations')>()),
  inviteUsers: mocks.invite,
}));
import { sendInvitations } from './invitations';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ userId: 'admin' });
});
it('yanlış kök türü doğrulanır, yetki kontrolü önce gelir', async () => {
  expect(await sendInvitations({} as unknown as string)).toMatchObject({
    ok: false,
    errorCode: 'VALIDATION_INVALID',
  });
  expect(mocks.invite).not.toHaveBeenCalled();
  mocks.admin.mockRejectedValue(codedForbidden('AUTH_FORBIDDEN'));
  expect(await sendInvitations({} as unknown as string)).toMatchObject({
    ok: false,
    errorCode: 'AUTH_FORBIDDEN',
  });
});

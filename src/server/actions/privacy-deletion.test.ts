import { expect, it, vi } from 'vitest';

const { remove, deletion } = vi.hoisted(() => ({
  remove: vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
  deletion: vi.fn(),
}));
vi.mock('../permissions', () => ({ requireUser: async () => ({ userId: 'session-user' }) }));
vi.mock('../db', () => ({ getDb: () => ({}) }));
vi.mock('../external/storage', () => ({ getStorage: () => ({ delete: remove }) }));
vi.mock('../services/accountDeletion', () => ({ deleteAccount: deletion }));

import { deleteAccount } from './privacy';

it('hesap silme eylemi gerçek depolama bağlantısına yalnız servisin anahtarlarını verir', async () => {
  deletion.mockImplementation(async (...args) => {
    const userId = args[1];
    const deps = args[3] as { removeStoredFiles(keys: string[]): Promise<void> };
    expect(userId).toBe('session-user');
    await deps.removeStoredFiles(['graduation/session-user/file.pdf']);
    return { deleted: true };
  });
  expect(await deleteAccount({ confirmEmail: 'ornek@example.invalid' })).toEqual({
    ok: true,
    data: { deleted: true },
  });
  expect(remove).toHaveBeenCalledExactlyOnceWith('graduation/session-user/file.pdf');
});

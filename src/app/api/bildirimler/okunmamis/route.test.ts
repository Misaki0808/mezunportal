import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), count: vi.fn(), db: vi.fn(() => ({})) }));
vi.mock('@/server/permissions', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/server/services/inbox', () => ({ countMyUnread: mocks.count }));
vi.mock('@/server/db', () => ({ getDb: mocks.db }));
import { GET } from './route';
describe('okunmamış sayısı hata günlüğü', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.db.mockReturnValue({});
  });
  it('sayaç beklenmedik hatası tek satır, gizli ileti olmadan 500 döner', async () => {
    mocks.requireUser.mockResolvedValue({ userId: 'synthetic-user' });
    mocks.count.mockRejectedValue(new Error('ayse@example.test gizli'));
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const response = await GET();
      expect(response.status).toBe(500);
      expect(write).toHaveBeenCalledTimes(1);
      const line = String(write.mock.calls[0]![0]);
      expect(JSON.parse(line)).toEqual({
        event: 'route.unexpected',
        source: 'bildirimlerOkunmamis',
        errorName: 'Error',
      });
      expect(line).not.toContain('ayse');
    } finally {
      write.mockRestore();
    }
  });
  it('yetkisiz 401 sessiz, başarı 200', async () => {
    const { codedUnauthenticated } = await import('@/lib/errors');
    mocks.requireUser.mockRejectedValueOnce(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect((await GET()).status).toBe(401);
      expect(write).not.toHaveBeenCalled();
      mocks.requireUser.mockResolvedValue({ userId: 'synthetic-user' });
      mocks.count.mockResolvedValue(2);
      const response = await GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ unread: 2 });
    } finally {
      write.mockRestore();
    }
  });
});

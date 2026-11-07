import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedNotFound } from '@/lib/errors';

const mocks = vi.hoisted(() => ({ getSessionUserId: vi.fn(), read: vi.fn() }));
vi.mock('@/server/permissions/session', () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock('@/server/services/graduation-document', () => ({
  readGraduationDocumentFile: mocks.read,
}));
vi.mock('@/server/db', () => ({ getDb: () => ({}) }));
vi.mock('@/server/external/storage', () => ({ getStorage: () => ({}) }));

import { GET } from './route';

const call = (id = 'doc1') =>
  GET(new Request('http://localhost:3000/x'), { params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.getSessionUserId.mockReset();
  mocks.read.mockReset();
});

describe('GET /api/graduation-documents/[id]/file', () => {
  it('oturumsuz → 401 ve dosya okunmaz', async () => {
    mocks.getSessionUserId.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each([
    ['yetkisiz', codedForbidden('AUTH_FORBIDDEN')],
    ['askıda', codedForbidden('AUTH_ACCOUNT_SUSPENDED')],
    ['doğrulanmamış', codedForbidden('AUTH_NOT_VERIFIED')],
    ['yok / karar verilmiş', codedNotFound('RESOURCE_NOT_FOUND')],
    ['depolama hatası', new Error('disk')],
  ])('%s → 404 (ayırt edilmez; gövde yok)', async (_label, error) => {
    mocks.getSessionUserId.mockResolvedValue('admin1');
    mocks.read.mockRejectedValue(error);
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('yetkili yönetici: PDF baytları, güvenli başlıklar (nosniff, no-store, kısıtlı CSP, inline)', async () => {
    mocks.getSessionUserId.mockResolvedValue('admin1');
    mocks.read.mockResolvedValue(new TextEncoder().encode('%PDF-1.7 gövde'));

    const response = await call('doc42');

    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith(expect.anything(), 'admin1', 'doc42');
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(await response.text()).toBe('%PDF-1.7 gövde');
  });

  it('kimlik oturumdan gelir: yol parametresi yalnız belge kimliğidir', async () => {
    mocks.getSessionUserId.mockResolvedValue('admin1');
    mocks.read.mockResolvedValue(new Uint8Array());
    await call('baska-birinin-kimligi');
    expect(mocks.read.mock.calls[0]?.[1]).toBe('admin1');
  });
});

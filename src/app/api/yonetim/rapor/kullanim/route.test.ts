import { beforeEach, describe, expect, it, vi } from 'vitest';

import { USAGE_EXPORT_FILE_NAME, USAGE_EXPORT_HREF, usageExportHref } from '@/contracts/metrics';
import {
  codedForbidden,
  codedRateLimited,
  codedUnauthenticated,
  codedValidation,
} from '@/lib/errors';

const mocks = vi.hoisted(() => ({ session: vi.fn(), exportUsage: vi.fn() }));
vi.mock('@/server/permissions/session', () => ({ getSessionUserId: mocks.session }));
vi.mock('@/server/db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('@/server/services/usage-metrics', () => ({ exportUsageMetrics: mocks.exportUsage }));

import { GET } from './route';

const range = { from: new Date('2031-03-01T00:00:00Z'), to: new Date('2031-04-01T00:00:00Z') };
const call = (query?: string) =>
  GET(new Request(`http://localhost${query ?? usageExportHref(range)}`));
beforeEach(() => {
  mocks.session.mockReset().mockResolvedValue('yonetici-1');
  mocks.exportUsage.mockReset().mockResolvedValue({
    bytes: new Uint8Array([0x50, 0x4b, 1]),
    fileName: USAGE_EXPORT_FILE_NAME,
  });
});

describe('GET kullanım metrikleri (Excel)', () => {
  it('oturumsuz 401; servis çağrılmaz', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.exportUsage).not.toHaveBeenCalled();
  });
  it('başarı: dosya başlıkları, oturumdaki kimlik ve çözümlenen süzgeç servise gider', async () => {
    const response = await call(
      usageExportHref({ ...range, departmentId: 'bolum-1', types: ['SEARCH', 'LOGIN'] }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="${USAGE_EXPORT_FILE_NAME}"`,
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const args = mocks.exportUsage.mock.calls[0]!;
    expect(args[1]).toBe('yonetici-1');
    expect(args[2]).toMatchObject({ departmentId: 'bolum-1', types: ['LOGIN', 'SEARCH'] });
  });
  it('bozuk/yetki veren parametreler 400: bilinmeyen anahtar, tekrar eden tekil anahtar, ters aralık, çok geniş aralık', async () => {
    const base = `${USAGE_EXPORT_HREF}?from=2031-03-01T00:00:00Z&to=2031-04-01T00:00:00Z`;
    for (const query of [
      `${base}&userId=baska`,
      `${base}&departmentId=a&departmentId=b`,
      `${base}&departmentId=a&facultyId=b`,
      `${USAGE_EXPORT_HREF}?from=2031-04-01T00:00:00Z&to=2031-03-01T00:00:00Z`,
      `${USAGE_EXPORT_HREF}?from=2030-01-01T00:00:00Z&to=2032-06-01T00:00:00Z`,
      USAGE_EXPORT_HREF,
    ]) {
      expect((await call(query)).status, query).toBe(400);
    }
    expect(mocks.exportUsage).not.toHaveBeenCalled();
  });
  it('servis hataları durum koduna çevrilir; ayrıntı sızmaz', async () => {
    const cases: [unknown, number][] = [
      [codedUnauthenticated('AUTH_UNAUTHENTICATED'), 401],
      [codedForbidden('AUTH_FORBIDDEN'), 403],
      [codedForbidden('CONSENT_REQUIRED'), 403],
      [codedValidation('VALIDATION_INVALID'), 400],
      [codedRateLimited('RATE_LIMITED'), 429],
      [new Error('postgres://gizli@host/db'), 500],
    ];
    for (const [error, status] of cases) {
      mocks.exportUsage.mockRejectedValueOnce(error);
      const response = await call();
      expect(response.status).toBe(status);
      expect(await response.text()).toBe('');
    }
  });
});

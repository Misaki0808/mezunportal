import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EMPLOYMENT_EXPORT_CONTENT_TYPE,
  EMPLOYMENT_EXPORT_FILE_NAME,
  EMPLOYMENT_EXPORT_HREF,
  employmentExportHref,
} from '@/contracts/admin';
import {
  codedForbidden,
  codedRateLimited,
  codedUnauthenticated,
  codedValidation,
} from '@/lib/errors';

const mocks = vi.hoisted(() => ({ session: vi.fn(), exportReport: vi.fn() }));
vi.mock('@/server/permissions/session', () => ({ getSessionUserId: mocks.session }));
vi.mock('@/server/db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('@/server/services/admin-employment', () => ({
  exportEmploymentReport: mocks.exportReport,
}));

import { GET } from './route';

const call = (query = '') => GET(new Request(`http://localhost${EMPLOYMENT_EXPORT_HREF}${query}`));
beforeEach(() => {
  mocks.session.mockReset().mockResolvedValue('yonetici-1');
  mocks.exportReport.mockReset().mockResolvedValue({
    bytes: new Uint8Array([0x50, 0x4b, 1, 2]),
    fileName: EMPLOYMENT_EXPORT_FILE_NAME,
  });
});

describe('GET istihdam raporu (Excel)', () => {
  it('oturumsuz 401; servis çağrılmaz', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(401);
    expect(mocks.exportReport).not.toHaveBeenCalled();
  });

  it('başarı: dosya başlıkları ve oturumdaki kimlik servise gider', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(EMPLOYMENT_EXPORT_CONTENT_TYPE);
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="${EMPLOYMENT_EXPORT_FILE_NAME}"`,
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-length')).toBe('4');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0x50, 0x4b, 1, 2]),
    );
    expect(mocks.exportReport).toHaveBeenCalledWith({ db: { marker: 'db' } }, 'yonetici-1', {});
  });

  it('süzgeç sorgu dizgesinden okunur; sözleşmenin bağlantı üreticisiyle uyumludur', async () => {
    const href = employmentExportHref({
      departmentId: 'bolum-1',
      graduationYearFrom: 2019,
      graduationYearTo: 2023,
    });
    await GET(new Request(`http://localhost${href}`));
    expect(mocks.exportReport.mock.calls[0]![2]).toEqual({
      departmentId: 'bolum-1',
      graduationYearFrom: 2019,
      graduationYearTo: 2023,
    });
  });

  it('istemci kimliği/rolü sorgudan alınmaz: bilinmeyen, tekrarlı ya da bozuk parametre 400', async () => {
    for (const query of [
      '?userId=baska',
      '?role=SYSTEM',
      '?departmentId=a&departmentId=b',
      '?graduationYearFrom=abc',
      '?graduationYearFrom=1900',
      '?departmentId=a&facultyId=b',
      '?graduationYearFrom=2025&graduationYearTo=2020',
    ]) {
      const response = await call(query);
      expect(response.status, query).toBe(400);
    }
    expect(mocks.exportReport).not.toHaveBeenCalled();
  });

  it('servis hataları durum koduna çevrilir; ayrıntı sızmaz', async () => {
    const cases: [unknown, number][] = [
      [codedUnauthenticated('AUTH_UNAUTHENTICATED'), 401],
      [codedForbidden('AUTH_FORBIDDEN'), 403],
      [codedForbidden('AUTH_ACCOUNT_SUSPENDED'), 403],
      [codedForbidden('AUTH_NOT_VERIFIED'), 403],
      [codedValidation('VALIDATION_INVALID'), 400],
      [codedRateLimited('RATE_LIMITED'), 429],
      [new Error('postgres://gizli@host/db'), 500],
    ];
    for (const [error, status] of cases) {
      mocks.exportReport.mockRejectedValueOnce(error);
      const response = await call();
      expect(response.status).toBe(status);
      expect(await response.text()).toBe('');
      expect(response.headers.get('content-type')).not.toBe(EMPLOYMENT_EXPORT_CONTENT_TYPE);
    }
  });

  it('429 yanıtı bekleme süresini bildirir', async () => {
    mocks.exportReport.mockRejectedValueOnce(codedRateLimited('RATE_LIMITED'));
    expect((await call()).headers.get('retry-after')).toBe('3600');
  });
});

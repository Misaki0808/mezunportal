import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APPOINTMENT_ICS_CONTENT_TYPE } from '@/contracts/appointment';
import { codedNotFound, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({ session: vi.fn(), ics: vi.fn() }));
vi.mock('@/server/permissions/session', () => ({ getSessionUserId: mocks.session }));
vi.mock('@/server/db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('@/server/services/appointment', () => ({ getAppointmentIcs: mocks.ics }));

import { GET } from './route';

const call = (id = 'a1') =>
  GET(new Request(`http://localhost/api/randevu/${id}/ics`), { params: Promise.resolve({ id }) });
beforeEach(() => {
  mocks.session.mockReset().mockResolvedValue('kullanici-1');
  mocks.ics.mockReset().mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
});

describe('GET randevu .ics', () => {
  it('oturumsuz 401; servis çağrılmaz', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.ics).not.toHaveBeenCalled();
  });
  it('başarı: dosya başlıkları, kimlik oturumdan, randevu kimliği parametreden', async () => {
    const response = await call('rnd-9');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(APPOINTMENT_ICS_CONTENT_TYPE);
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="randevu.ics"');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toContain('BEGIN:VCALENDAR');
    expect(mocks.ics.mock.calls[0]![1]).toBe('kullanici-1');
    expect(mocks.ics.mock.calls[0]![2]).toEqual({ appointmentId: 'rnd-9' });
  });
  it('yetkisiz/olmayan/onaylı olmayan/beklenmeyen hata ayırt edilmez: 404 ve gövde yok', async () => {
    for (const error of [
      codedNotFound('RESOURCE_NOT_FOUND'),
      new Error('postgres://gizli@host/db'),
    ]) {
      mocks.ics.mockRejectedValueOnce(error);
      const response = await call();
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
    mocks.ics.mockRejectedValueOnce(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    expect((await call()).status).toBe(401);
  });
});

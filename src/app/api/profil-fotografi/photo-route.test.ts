import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({
  require: vi.fn(),
  session: vi.fn(),
  upload: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@/server/permissions', () => ({ requireUser: auth.require }));
vi.mock('@/server/permissions/route-session', () => ({ readRouteSession: auth.session }));
vi.mock('@/server/services/profile-photo', () => ({
  uploadProfilePhoto: auth.upload,
  readProfilePhoto: auth.read,
}));
vi.mock('@/server/db', () => ({ getDb: () => ({}) }));
vi.mock('@/server/external/storage', () => ({ getStorage: () => ({}) }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ APP_URL: 'http://127.0.0.1:3415' }) }));
import { codedNotFound, codedForbidden, codedValidation, codedConflict } from '@/lib/errors';
import { POST } from './route';
import { boundedPhotoForm } from '@/server/services/photo-upload-body';
import { GET } from './[userId]/route';
import { PROFILE_PHOTO_MAX_BYTES } from '@/contracts/profile-photo';
beforeEach(() => {
  vi.resetAllMocks();
  auth.require.mockResolvedValue({ userId: 'owner' });
  auth.session.mockResolvedValue({ ok: true, userId: 'viewer' });
  auth.upload.mockResolvedValue({ saved: true });
  auth.read.mockResolvedValue(new Uint8Array([1, 2]));
});
function request(origin = 'http://127.0.0.1:3415', consent = 'true') {
  const form = new FormData();
  form.set('file', new File(['fake'], 'photo.jpg', { type: 'image/jpeg' }));
  form.set('consent', consent);
  form.set('consentVersion', 'taslak-1');
  return new Request('http://127.0.0.1:3415/api/profil-fotografi', {
    method: 'POST',
    body: form,
    headers: { origin },
  });
}
it('oturum/rıza önce: yükleme hiç çağrılmaz', async () => {
  auth.require.mockRejectedValue(codedForbidden('CONSENT_REQUIRED'));
  expect((await POST(request())).status).toBe(403);
  expect(auth.upload).not.toHaveBeenCalled();
});
it('çapraz köken ve açık rıza olmadan multipart yazılmaz; istemci dosya adı güvenilir değildir', async () => {
  const crossOrigin = await POST(request('https://evil.test'));
  expect(crossOrigin.status).toBe(403);
  // "Yetkin yok" demez: adres eşleşmesi sorunu ayrı koddur, kullanıcıya "sayfayı yenile" denir.
  expect(await crossOrigin.json()).toEqual({ errorCode: 'REQUEST_ORIGIN_MISMATCH' });
  expect((await POST(request(undefined, 'false'))).status).toBe(422);
  expect(auth.upload).not.toHaveBeenCalled();
  expect((await POST(request())).status).toBe(200);
  expect(auth.upload).toHaveBeenCalledWith(
    expect.anything(),
    'owner',
    expect.objectContaining({ bytes: new Uint8Array(Buffer.from('fake')) }),
  );
});
it('eşzamanlı görüntü işleme geçici yoğunluğu kararlı kodla döner', async () => {
  auth.upload.mockRejectedValueOnce(codedConflict('PHOTO_PROCESSING_BUSY'));
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ errorCode: 'PHOTO_PROCESSING_BUSY' });
});
it('Content-Length olmadan da taşan akış 5 MB bütçesinde kesilir', async () => {
  const request = new Request('http://localhost', {
    method: 'POST',
    body: new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 16_385),
  });
  await expect(boundedPhotoForm(request)).rejects.toMatchObject({ code: 'PHOTO_TOO_LARGE' });
});
it('yetkisiz/olmayan/rızasız fotoğraf aynı boş 404; özel önbellek ve MIME korunur', async () => {
  const context = { params: Promise.resolve({ userId: 'owner' }) };
  auth.session.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) });
  const anonymous = await GET(new Request('http://localhost/photo'), context);
  for (const code of ['AUTH_FORBIDDEN', 'RESOURCE_NOT_FOUND'] as const) {
    auth.read.mockRejectedValueOnce(
      code === 'RESOURCE_NOT_FOUND' ? codedNotFound(code) : codedForbidden(code),
    );
    const response = await GET(new Request('http://localhost/photo'), context);
    expect(response.status).toBe(anonymous.status);
    expect(await response.text()).toBe('');
  }
  const response = await GET(new Request('http://localhost/photo?size=96'), context);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('content-type')).toBe('image/webp');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
});
it('GET altyapı hatası boş 503, yokluk ve yetki reddi aynı boş 404 kalır', async () => {
  const context = { params: Promise.resolve({ userId: 'owner' }) };
  for (const error of [codedNotFound('RESOURCE_NOT_FOUND'), codedForbidden('CONSENT_REQUIRED')]) {
    auth.read.mockRejectedValueOnce(error);
    const response = await GET(new Request('http://localhost/photo'), context);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  }
  for (const error of [
    new Error('synthetic infrastructure failure'),
    codedValidation('DB_UNAVAILABLE'),
  ]) {
    auth.read.mockRejectedValueOnce(error);
    const response = await GET(new Request('http://localhost/photo'), context);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  }
});

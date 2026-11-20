import { afterAll, expect, it, vi } from 'vitest';
import { codedUnauthenticated } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

const state = vi.hoisted(() => ({
  db: null as unknown,
  userId: '',
  files: new Map<string, Uint8Array>(),
}));
vi.mock('@/server/db', () => ({ getDb: () => state.db }));
vi.mock('@/server/external/storage', () => ({
  getStorage: () => ({ get: async (key: string) => state.files.get(key) ?? null }),
}));
vi.mock('@/server/permissions', () => ({
  requireUserWithoutConsent: async () => {
    if (!state.userId) throw codedUnauthenticated('AUTH_UNAUTHENTICATED');
    return { userId: state.userId };
  },
}));
import { GET } from '@/app/api/hesabim/cv/[id]/route';
import { buildDataExport } from './dataExport';

const db = createTestPrisma();
state.db = db;
afterAll(() => db.$disconnect());
const request = (id: string) =>
  GET(new Request('http://localhost/'), { params: Promise.resolve({ id }) });
it('yalnız kendi dosyasını no-store ve attachment ile verir; yabancı, eksik kayıt ve eksik dosya aynı 404', async () => {
  const owner = await createUser(db),
    other = await createUser(db);
  const mineKey = `cv/${owner}/mine.pdf`,
    otherKey = `cv/${other}/other.pdf`;
  state.files.set(mineKey, new TextEncoder().encode('%PDF-owner'));
  state.files.set(otherKey, new TextEncoder().encode('%PDF-other'));
  const mine = await db.cvUpload.create({
    data: { userId: owner, storageKey: mineKey, byteSize: 10, pageCount: 1 },
  });
  const foreign = await db.cvUpload.create({
    data: { userId: other, storageKey: otherKey, byteSize: 10, pageCount: 1 },
  });
  state.userId = owner;
  const exportData = await buildDataExport(db, owner);
  expect(exportData.cv.uploads.find((x) => x.id === mine.id)?.downloadPath).toBe(
    `/api/hesabim/cv/${mine.id}`,
  );
  const own = await request(mine.id);
  expect(own.status).toBe(200);
  expect(await own.text()).toBe('%PDF-owner');
  expect(own.headers.get('cache-control')).toBe('no-store');
  expect(own.headers.get('content-disposition')).toBe('attachment; filename="cv.pdf"');
  const foreignResponse = await request(foreign.id),
    absent = await request('missing');
  expect(foreignResponse.status).toBe(404);
  expect(absent.status).toBe(404);
  expect(await foreignResponse.json()).toEqual(await absent.json());
  state.files.delete(mineKey);
  const missingFile = await request(mine.id);
  expect(missingFile.status).toBe(404);
  expect(await missingFile.json()).toEqual({ errorCode: 'RESOURCE_NOT_FOUND' });
  await db.cvUpload.update({
    where: { id: mine.id },
    data: { storageKey: null, status: 'APPLIED', appliedAt: new Date() },
  });
  const removedExport = await buildDataExport(db, owner);
  expect(removedExport.cv.uploads.find((row) => row.id === mine.id)).toMatchObject({
    hasFile: false,
    downloadPath: `/api/hesabim/cv/${mine.id}`,
  });
  await db.user.update({ where: { id: owner }, data: { banned: true } });
  const suspended = await request(mine.id);
  expect(suspended.status).toBe(403);
  expect(await suspended.json()).toEqual({ errorCode: 'AUTH_ACCOUNT_SUSPENDED' });
  await db.user.update({ where: { id: owner }, data: { banned: false } });
  state.userId = '';
  const anonymous = await request(mine.id);
  expect(anonymous.status).toBe(401);
  expect(await anonymous.json()).toEqual({ errorCode: 'AUTH_UNAUTHENTICATED' });
});

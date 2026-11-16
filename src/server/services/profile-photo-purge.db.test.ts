import { afterAll, expect, it, vi } from 'vitest';

import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import type { PrismaClient } from '@/generated/prisma/client';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';
import { createMemoryStorage } from '../external/storage';
import { newProfilePhotoKeys } from '../external/storage/keys';
import { recordConsents } from './privacy';
import { purgeProfilePhotos } from './profile-photo-purge';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const version = CURRENT_CONSENT_VERSIONS.PROFILE_PHOTO_VISIBILITY;

/** Paylaşılan test DB'sindeki başka dosyaların fotoğraflarına dokunma. */
function scopedDb(userIds: string[]): PrismaClient {
  return db.$extends({
    query: {
      profilePhoto: {
        async findMany({ args, query }) {
          args.where = { AND: [args.where ?? {}, { userId: { in: userIds } }] };
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

async function seedPhoto(userId: string, storage: ReturnType<typeof createMemoryStorage>) {
  const keys = newProfilePhotoKeys(userId);
  await storage.put(keys.largeKey, new Uint8Array([1]), { contentType: 'image/webp' });
  await storage.put(keys.smallKey, new Uint8Array([2]), { contentType: 'image/webp' });
  await db.profilePhoto.create({ data: { userId, ...keys } });
  return keys;
}

it('rıza kapandıktan sonra depolama arızası sürerse sonraki işte idempotent temizlenir', async () => {
  const userId = await createUser(db);
  const storage = createMemoryStorage();
  const keys = await seedPhoto(userId, storage);
  const scoped = scopedDb([userId]);
  await db.consent.create({
    data: { userId, documentType: 'PROFILE_PHOTO_VISIBILITY', version, granted: true },
  });
  let failures = 2;
  const flakyStorage = {
    ...storage,
    async delete(key: string) {
      if (key === keys.smallKey && failures > 0) {
        failures--;
        throw new Error('synthetic storage failure');
      }
      await storage.delete(key);
    },
  };
  await expect(
    recordConsents(
      db,
      userId,
      [{ documentType: 'PROFILE_PHOTO_VISIBILITY', version, granted: false }],
      CURRENT_CONSENT_VERSIONS,
      flakyStorage,
    ),
  ).rejects.toMatchObject({ code: 'PHOTO_CLEANUP_PENDING' });
  expect(storage.files.has(keys.largeKey)).toBe(false);
  expect(storage.files.has(keys.smallKey)).toBe(true);
  expect(await purgeProfilePhotos(scoped, flakyStorage)).toEqual({
    scanned: 1,
    removed: 0,
    failed: 1,
  });
  expect(await db.profilePhoto.findUnique({ where: { userId } })).not.toBeNull();
  expect(await purgeProfilePhotos(scoped, flakyStorage)).toEqual({
    scanned: 1,
    removed: 1,
    failed: 0,
  });
  expect(await db.profilePhoto.findUnique({ where: { userId } })).toBeNull();
  expect(storage.files.has(keys.largeKey)).toBe(false);
  expect(storage.files.has(keys.smallKey)).toBe(false);
  expect(await purgeProfilePhotos(scoped, storage)).toEqual({ scanned: 0, removed: 0, failed: 0 });
});

it('son güncel rızayı korur; eski rıza, rıza yokluğu ve silinmiş hesapları temizler', async () => {
  const storage = createMemoryStorage();
  const [active, stale, missing, deleted] = await Promise.all(
    Array.from({ length: 4 }, () => createUser(db)),
  );
  const ids = [active!, stale!, missing!, deleted!];
  for (const id of ids) await seedPhoto(id, storage);
  const at = (day: number) => new Date(Date.UTC(2025, 0, day));
  await db.consent.createMany({
    data: [
      {
        userId: active!,
        documentType: 'PROFILE_PHOTO_VISIBILITY',
        version,
        granted: false,
        createdAt: at(1),
      },
      {
        userId: active!,
        documentType: 'PROFILE_PHOTO_VISIBILITY',
        version,
        granted: true,
        createdAt: at(2),
      },
      {
        userId: stale!,
        documentType: 'PROFILE_PHOTO_VISIBILITY',
        version: 'eski',
        granted: true,
        createdAt: at(1),
      },
      {
        userId: deleted!,
        documentType: 'PROFILE_PHOTO_VISIBILITY',
        version,
        granted: true,
        createdAt: at(1),
      },
    ],
  });
  await db.user.update({ where: { id: deleted! }, data: { deletedAt: new Date() } });
  expect(await purgeProfilePhotos(scopedDb(ids), storage)).toEqual({
    scanned: 4,
    removed: 3,
    failed: 0,
  });
  expect(await db.profilePhoto.findUnique({ where: { userId: active! } })).not.toBeNull();
  for (const id of [stale!, missing!, deleted!])
    expect(await db.profilePhoto.findUnique({ where: { userId: id } })).toBeNull();
});

it('süpürme kullanıcı kilidiyle yeni rıza ve fotoğrafı silmeden sıralanır', async () => {
  const userId = await createUser(db);
  const storage = createMemoryStorage();
  const oldKeys = await seedPhoto(userId, storage);
  await db.consent.create({
    data: {
      userId,
      documentType: 'PROFILE_PHOTO_VISIBILITY',
      version,
      granted: false,
      createdAt: new Date('2025-01-01T00:00:00Z'),
    },
  });
  const newKeys = newProfilePhotoKeys(userId);
  await storage.put(newKeys.largeKey, new Uint8Array([3]), { contentType: 'image/webp' });
  await storage.put(newKeys.smallKey, new Uint8Array([4]), { contentType: 'image/webp' });

  let release!: () => void;
  let signalDelete!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const deleting = new Promise<void>((resolve) => (signalDelete = resolve));
  const delayedStorage = {
    ...storage,
    async delete(key: string) {
      if (key === oldKeys.largeKey) {
        signalDelete();
        await gate;
      }
      await storage.delete(key);
    },
  };
  const purge = purgeProfilePhotos(scopedDb([userId]), delayedStorage);
  await deleting;
  let signalPid!: (pid: number) => void;
  const pidPromise = new Promise<number>((resolve) => (signalPid = resolve));
  const writer = db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    signalPid(row!.pid);
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
    await tx.profilePhoto.deleteMany({ where: { userId } });
    await tx.consent.create({
      data: { userId, documentType: 'PROFILE_PHOTO_VISIBILITY', version, granted: true },
    });
    await tx.profilePhoto.create({ data: { userId, ...newKeys } });
  });
  try {
    const pid = await pidPromise;
    await vi.waitFor(
      async () => {
        const [row] = await db.$queryRaw<{ count: number }[]>`
          SELECT cardinality(pg_blocking_pids(${pid}))::int AS count`;
        expect(row!.count).toBeGreaterThan(0);
      },
      { interval: 20, timeout: 2000 },
    );
  } finally {
    release();
    await Promise.all([purge, writer]);
  }
  expect(await db.profilePhoto.findUniqueOrThrow({ where: { userId } })).toMatchObject(newKeys);
  expect(storage.files.has(newKeys.largeKey)).toBe(true);
  expect(storage.files.has(newKeys.smallKey)).toBe(true);
  expect(await purgeProfilePhotos(scopedDb([userId]), storage)).toEqual({
    scanned: 1,
    removed: 0,
    failed: 0,
  });
});

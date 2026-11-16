import sharp from 'sharp';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PROFILE_PHOTO_MAX_BYTES } from '@/contracts/profile-photo';
import { myPhotoState } from './profile-photo-state';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { createMemoryStorage } from '../external/storage';
import * as processor from '../external/profile-photo';
import { uploadProfilePhoto, readProfilePhoto, moderateProfilePhoto } from './profile-photo';
import { recordConsents } from './privacy';
import { deleteAccount } from './accountDeletion';
import { buildDataExport } from './dataExport';
const db = createTestPrisma();
const storage = createMemoryStorage();
const deps = { db, storage };
let bytes: Uint8Array;
let departmentId: string;
beforeAll(async () => {
  departmentId = (await createInstitution(db)).deptA1;
  bytes = await sharp({ create: { width: 20, height: 30, channels: 3, background: 'blue' } })
    .png()
    .toBuffer();
});
afterAll(() => db.$disconnect());
async function person(dept = departmentId, status: 'VERIFIED' | 'PENDING' = 'VERIFIED') {
  const id = await createUser(db);
  await addMembership(db, {
    userId: id,
    departmentId: dept,
    role: 'STUDENT',
    entryYear: 2025,
    status,
  });
  await grantRequiredConsents(db, id);
  return id;
}
const upload = (userId: string) =>
  uploadProfilePhoto(deps, userId, {
    bytes,
    crop: { x: 0.5, y: 0.5, zoom: 1 },
    consentVersion: CURRENT_CONSENT_VERSIONS.PROFILE_PHOTO_VISIBILITY,
  });
const revoke = (userId: string) =>
  recordConsents(
    db,
    userId,
    [
      {
        documentType: 'PROFILE_PHOTO_VISIBILITY',
        version: CURRENT_CONSENT_VERSIONS.PROFILE_PHOTO_VISIBILITY,
        granted: false,
      },
    ],
    CURRENT_CONSENT_VERSIONS,
    storage,
  );

it('yalnız iki kullanıcıya bağlı WebP anahtarı; aynı üniversite ve sahip okuyabilir', async () => {
  const owner = await person(),
    viewer = await person();
  await upload(owner);
  const photo = await db.profilePhoto.findUniqueOrThrow({ where: { userId: owner } });
  expect(photo.largeKey).toMatch(new RegExp(`^photo/${owner}/[0-9a-f-]{36}-512.webp$`));
  expect(photo.smallKey).toMatch(/-96\.webp$/);
  for (const who of [owner, viewer]) {
    expect(await sharp(await readProfilePhoto(deps, who, owner, 512)).metadata()).toMatchObject({
      width: 512,
      height: 512,
    });
    expect(await sharp(await readProfilePhoto(deps, who, owner, 96)).metadata()).toMatchObject({
      width: 96,
      height: 96,
    });
  }
  const before = photo.largeKey;
  await upload(owner);
  expect(storage.files.has(before)).toBe(false);
});
it('K-07: başka üniversite, doğrulanmamış/bitmiş üye, askı, silinmiş ve olmayan kullanıcı kapalı', async () => {
  const owner = await person();
  await upload(owner);
  const foreign = await person((await createInstitution(db)).deptA1);
  const pending = await person(departmentId, 'PENDING');
  const ended = await person();
  await db.membership.updateMany({ where: { userId: ended }, data: { endedAt: new Date() } });
  const banned = await person();
  await db.user.update({ where: { id: banned }, data: { banned: true } });
  const deleted = await person();
  await db.user.update({ where: { id: deleted }, data: { deletedAt: new Date() } });
  for (const viewer of [foreign, pending, ended, banned, deleted, 'absent'])
    await expect(readProfilePhoto(deps, viewer, owner, 96)).rejects.toBeDefined();
  const valid = await person();
  for (const data of [
    { banned: true, deletedAt: null },
    { banned: false, deletedAt: new Date() },
  ]) {
    await db.user.update({ where: { id: owner }, data });
    await expect(readProfilePhoto(deps, valid, owner, 96)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  }
});
it('zorunlu rıza, biçim ve sürüm geçmeden hiçbir dosya/ayrı rıza yazılmaz', async () => {
  const id = await createUser(db);
  await expect(upload(id)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  const owner = await person();
  await expect(
    uploadProfilePhoto(deps, owner, {
      bytes,
      crop: { x: 2, y: 0, zoom: 1 },
      consentVersion: 'taslak-1',
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION_INVALID' });
  await expect(
    uploadProfilePhoto(deps, owner, {
      bytes,
      crop: { x: 0.5, y: 0.5, zoom: 1 },
      consentVersion: 'eski',
    }),
  ).rejects.toMatchObject({ code: 'CONSENT_VERSION_OUTDATED' });
  expect(await db.profilePhoto.findUnique({ where: { userId: owner } })).toBeNull();
});
it('rıza geri alınınca sahibi dahil okuyamaz; dosyalar ve satır gider, tekrar geri alma idempotenttir', async () => {
  const owner = await person();
  await upload(owner);
  const photo = await db.profilePhoto.findUniqueOrThrow({ where: { userId: owner } });
  await revoke(owner);
  await revoke(owner);
  expect(storage.files.has(photo.largeKey)).toBe(false);
  expect(storage.files.has(photo.smallKey)).toBe(false);
  expect(await db.profilePhoto.findUnique({ where: { userId: owner } })).toBeNull();
  await expect(readProfilePhoto(deps, owner, owner, 96)).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
  });
});
it('temizlik atlanmış rıza satırında bile rota son kararı uygular (eski sürüm dahil)', async () => {
  const owner = await person();
  await upload(owner);
  await db.consent.create({
    data: {
      userId: owner,
      documentType: 'PROFILE_PHOTO_VISIBILITY',
      version: 'taslak-1',
      granted: false,
    },
  });
  await expect(readProfilePhoto(deps, owner, owner, 96)).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
  });
  await db.consent.create({
    data: {
      userId: owner,
      documentType: 'PROFILE_PHOTO_VISIBILITY',
      version: 'eski',
      granted: true,
    },
  });
  await expect(readProfilePhoto(deps, owner, owner, 96)).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
  });
});
it('KVKK dökümü iki gerçek türevi içerir, depolama anahtarı içermez; hesap silme ikisini de kaldırır', async () => {
  const owner = await person();
  await upload(owner);
  const photo = await db.profilePhoto.findUniqueOrThrow({ where: { userId: owner } });
  const output = await buildDataExport(db, owner, new Date(), storage);
  expect(output.profilePhoto?.contentType).toBe('image/webp');
  expect(Buffer.from(output.profilePhoto!.largeBase64, 'base64')).toEqual(
    Buffer.from(storage.files.get(photo.largeKey)!),
  );
  expect(JSON.stringify(output)).not.toContain(photo.largeKey);
  const user = await db.user.findUniqueOrThrow({ where: { id: owner } });
  await deleteAccount(
    db,
    owner,
    { confirmEmail: user.email, publishedContent: 'ANONYMIZE' },
    {
      removeStoredFiles: async (keys) => {
        for (const key of keys) await storage.delete(key);
      },
    },
  );
  expect(await db.profilePhoto.findUnique({ where: { userId: owner } })).toBeNull();
  expect(storage.files.has(photo.largeKey)).toBe(false);
  expect(storage.files.has(photo.smallKey)).toBe(false);
});
it('kapsam dışı yönetici kaldıramaz; kapsam içi karar gerekçe ve tek işlem kaydı ister', async () => {
  const owner = await person();
  await upload(owner);
  const otherDept = (await createInstitution(db)).deptA1;
  const foreign = await person(otherDept);
  await addGrant(db, { userId: foreign, scope: 'DEPARTMENT', departmentId: otherDept });
  await expect(
    moderateProfilePhoto(deps, foreign, { userId: owner, reason: 'Uygun olmayan içerik' }),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  const admin = await person();
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId });
  await expect(
    moderateProfilePhoto(deps, admin, { userId: owner, reason: '' }),
  ).rejects.toMatchObject({ code: 'VALIDATION_INVALID' });
  await expect(
    moderateProfilePhoto(deps, admin, { userId: owner, reason: 'iletişim: test@example.com' }),
  ).rejects.toMatchObject({ code: 'AUDIT_REASON_INVALID' });
  await moderateProfilePhoto(deps, admin, { userId: owner, reason: 'Uygun olmayan içerik' });
  await moderateProfilePhoto(deps, admin, { userId: owner, reason: 'Uygun olmayan içerik' });
  expect(
    await db.adminAuditLog.count({ where: { action: 'PROFILE_PHOTO_REMOVE', targetId: owner } }),
  ).toBe(1);
  expect(await db.profilePhoto.findUnique({ where: { userId: owner } })).toBeNull();
});
it('yazma hatasında rıza ve yarım türev kalmaz', async () => {
  const owner = await person();
  storage.failures.put = true;
  try {
    await expect(upload(owner)).rejects.toBeDefined();
  } finally {
    storage.failures.put = false;
  }
  expect(await db.profilePhoto.findUnique({ where: { userId: owner } })).toBeNull();
  expect([...storage.files.keys()].filter((key) => key.includes(owner))).toEqual([]);
  expect(
    await db.consent.count({ where: { userId: owner, documentType: 'PROFILE_PHOTO_VISIBILITY' } }),
  ).toBe(0);
});
it('çözme sırasında geri çekilen rıza sonradan biten yüklemeyle yeniden açılamaz', async () => {
  const owner = await person();
  await upload(owner);
  const images = await processor.processProfilePhoto(bytes, { x: 0.5, y: 0.5, zoom: 1 });
  let start!: () => void, finish!: (value: typeof images) => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const deferred = new Promise<typeof images>((resolve) => {
    finish = resolve;
  });
  const spy = vi.spyOn(processor, 'processProfilePhoto').mockImplementationOnce(() => {
    start();
    return deferred;
  });
  try {
    const uploading = upload(owner);
    const rejected = expect(uploading).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    await started;
    await revoke(owner);
    finish(images);
    await rejected;
    expect(await db.profilePhoto.findUnique({ where: { userId: owner } })).toBeNull();
    expect([...storage.files.keys()].filter((key) => key.includes(owner))).toEqual([]);
  } finally {
    finish(images);
    spy.mockRestore();
  }
});
it('fotoğraf adresi yalnız görünür isimli sunucu DTO’sunda olur; anonim talepte anahtar bile yoktur', async () => {
  const { photoSources } = await import('./photo-presentation');
  const owner = await person();
  await upload(owner);
  const viewer = await person();
  const foreign = await person((await createInstitution(db)).deptA1);
  expect((await photoSources(db, [owner], { viewerId: viewer })).get(owner)).toContain(
    `/api/profil-fotografi/${owner}`,
  );
  expect((await photoSources(db, [owner], { viewerId: foreign })).size).toBe(0);
  await revoke(owner);
  expect((await photoSources(db, [owner], { viewerId: viewer })).size).toBe(0);
});
it('bekleyen anonim kaynak talebine fotoğraf eklenmez; onayda ve isimli profilde yalnız yetkili rota çıkar', async () => {
  const { listContactRequests } = await import('./contactRequest');
  const { getProfile } = await import('./profile-content');
  const owner = await person();
  await upload(owner);
  const viewer = await person();
  const request = await db.contactRequest.create({
    data: {
      requesterId: viewer,
      targetId: owner,
      source: 'SEEKER_PROFILE',
      sourceTitle: 'Staj adayı',
      sourceOrganization: 'A1',
      fields: ['EMAIL'],
    },
  });
  const hidden = await listContactRequests(db, viewer, { box: 'OUTGOING', limit: 10 });
  expect(hidden.items[0]!.counterpart).toBeNull();
  expect(JSON.stringify(hidden)).not.toContain(owner);
  expect(JSON.stringify(hidden)).not.toContain('photoSrc');
  await db.contactRequest.update({
    where: { id: request.id },
    data: { status: 'APPROVED', decidedAt: new Date() },
  });
  const approved = await listContactRequests(db, viewer, { box: 'OUTGOING', limit: 10 });
  expect(approved.items[0]!.counterpart?.photoSrc).toContain(`/api/profil-fotografi/${owner}`);
  const profile = await getProfile({ db }, viewer, owner);
  expect(profile.photoSrc).toContain(`/api/profil-fotografi/${owner}`);
  await revoke(owner);
  expect(await getProfile({ db }, viewer, owner)).not.toHaveProperty('photoSrc');
});
it('eksik fotoğraf türevi dökümde sessizce kaybolmaz: UNREADABLE olur, sağlam türev korunur', async () => {
  const owner = await person();
  await upload(owner);
  const photo = await db.profilePhoto.findUniqueOrThrow({ where: { userId: owner } });
  await storage.delete(photo.largeKey);
  const output = await buildDataExport(db, owner, new Date(), storage);
  expect(output.profilePhoto?.largeBase64).toBe('UNREADABLE');
  expect(output.profilePhoto?.smallBase64).toBe(
    Buffer.from(storage.files.get(photo.smallKey)!).toString('base64'),
  );
});
it('depolama silmesi başarısız olsa da rıza kalıcı kapanır; tekrar deneme dosyaları temizler', async () => {
  const owner = await person();
  await upload(owner);
  storage.failures.delete = true;
  try {
    await expect(revoke(owner)).rejects.toMatchObject({ code: 'PHOTO_CLEANUP_PENDING' });
    expect(await myPhotoState(db, owner)).toMatchObject({
      hasPhoto: false,
      consentGranted: false,
      cleanupPending: true,
    });
    const last = await db.consent.findFirstOrThrow({
      where: { userId: owner, documentType: 'PROFILE_PHOTO_VISIBILITY' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(last.granted).toBe(false);
    await expect(readProfilePhoto(deps, owner, owner, 96)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  } finally {
    storage.failures.delete = false;
  }
  await revoke(owner);
  expect(await db.profilePhoto.findUnique({ where: { userId: owner } })).toBeNull();
  expect([...storage.files.keys()].filter((key) => key.includes(owner))).toEqual([]);
});
it('eski dosya temizliği yeni rızayla yüklenen fotoğrafı silemez', async () => {
  const owner = await person();
  await upload(owner);
  const originalDelete = storage.delete.bind(storage);
  let started!: () => void, release!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  const spy = vi.spyOn(storage, 'delete').mockImplementation(async (key) => {
    if (first) {
      first = false;
      started();
      await wait;
    }
    await originalDelete(key);
  });
  const revoking = revoke(owner);
  try {
    await began;
    await upload(owner);
    const replacement = await db.profilePhoto.findUniqueOrThrow({ where: { userId: owner } });
    release();
    await revoking;
    expect(await db.profilePhoto.findUnique({ where: { userId: owner } })).toMatchObject({
      largeKey: replacement.largeKey,
    });
    expect(storage.files.has(replacement.largeKey)).toBe(true);
    expect(await readProfilePhoto(deps, owner, owner, 96)).toBeDefined();
  } finally {
    release();
    await revoking;
    spy.mockRestore();
  }
});
it('JPEG adı ve MIME sahteciliği ile 5 MB üstü dosya gerçek DB hattında rıza/dosya yazamaz', async () => {
  const owner = await person();
  const fake = new File(['%PDF-1.7'], 'profil.jpg', { type: 'image/jpeg' });
  const input = {
    crop: { x: 0.5, y: 0.5, zoom: 1 },
    consentVersion: CURRENT_CONSENT_VERSIONS.PROFILE_PHOTO_VISIBILITY,
  };
  await expect(
    uploadProfilePhoto(deps, owner, { ...input, bytes: new Uint8Array(await fake.arrayBuffer()) }),
  ).rejects.toMatchObject({ code: 'PHOTO_INVALID' });
  await expect(
    uploadProfilePhoto(deps, owner, {
      ...input,
      bytes: new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 1),
    }),
  ).rejects.toMatchObject({ code: 'PHOTO_TOO_LARGE' });
  expect(await db.profilePhoto.findUnique({ where: { userId: owner } })).toBeNull();
  expect(
    await db.consent.count({ where: { userId: owner, documentType: 'PROFILE_PHOTO_VISIBILITY' } }),
  ).toBe(0);
  expect([...storage.files.keys()].filter((key) => key.includes(owner))).toEqual([]);
});

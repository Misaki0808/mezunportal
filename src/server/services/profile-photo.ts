import 'server-only';

import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import {
  photoCropSchema,
  removeProfilePhotoSchema,
  type PhotoCrop,
} from '@/contracts/profile-photo';
import { codedNotFound, codedConflict, codedValidation } from '@/lib/errors';
import { createPermissions } from '../permissions/guards';
import { loadActor } from '../permissions/actor';
import { processProfilePhoto } from '../external/profile-photo';
import { newProfilePhotoKeys } from '../external/storage/keys';
import type { StorageAdapter } from '../external/storage';
import { canViewProfilePhoto } from '../rules/visibility';
import { nextPhotoConsentTime } from './profile-photo-consent';
import { eraseProfilePhoto } from './profile-photo-erasure';
import { requireConsent } from './privacy';
import { viewerUniversityIds } from './search';
import { covers, isSystem, loadAnyAdmin } from './admin-access';
import { recordAdminAction } from './audit';
import { consumeRateLimit } from './rateLimit';

export type PhotoDeps = { db: PrismaClient; storage: StorageAdapter; now?: () => Date };
const PHOTO_VERSION = CURRENT_CONSENT_VERSIONS.PROFILE_PHOTO_VISIBILITY;
const decision = (tx: Pick<Prisma.TransactionClient, 'consent'>, userId: string) =>
  tx.consent.findFirst({
    where: { userId, documentType: 'PROFILE_PHOTO_VISIBILITY' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, granted: true, version: true },
  });
const permissions = (db: Prisma.TransactionClient, userId: string, now: Date) =>
  createPermissions({
    db: () => db,
    getSessionUserId: async () => userId,
    now: () => now,
  });

export async function uploadProfilePhoto(
  deps: PhotoDeps,
  userId: string,
  input: {
    bytes: Uint8Array;
    crop: PhotoCrop;
    consentVersion: string;
  },
) {
  const now = (deps.now ?? (() => new Date()))();
  const observed = await deps.db.$transaction(async (tx) => {
    // Çözme başlamadan tutarlı nesil; dosya çözerken DB bağlantısı/kilidi tutulmaz.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR SHARE`;
    await permissions(tx, userId, now).requireUser();
    await requireConsent(tx, userId);
    const consent = await decision(tx, userId);
    const photo = await tx.profilePhoto.findUnique({
      where: { userId },
      select: { largeKey: true },
    });
    return { decisionId: consent?.id, photoKey: photo?.largeKey };
  });
  const crop = photoCropSchema.safeParse(input.crop);
  if (!crop.success) throw codedValidation('VALIDATION_INVALID');
  if (input.consentVersion !== PHOTO_VERSION) throw codedValidation('CONSENT_VERSION_OUTDATED');
  // Çözmeden önce kota; başarısız denemeler de maliyet taşır. Kişi başına saatte 10.
  await consumeRateLimit(
    deps.db,
    { name: 'profile-photo', limit: 10, windowMs: 3_600_000 },
    userId,
    now,
  );
  const images = await processProfilePhoto(input.bytes, crop.data);
  const keys = newProfilePhotoKeys(userId);
  try {
    await deps.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
      await permissions(tx, userId, now).requireUser();
      await requireConsent(tx, userId);
      const current = await decision(tx, userId);
      const currentPhoto = await tx.profilePhoto.findUnique({
        where: { userId },
        select: { largeKey: true },
      });
      if (current?.id !== observed.decisionId || currentPhoto?.largeKey !== observed.photoKey)
        throw codedConflict('RESOURCE_CONFLICT');
      await deps.storage.put(keys.largeKey, images.large, { contentType: 'image/webp' });
      await deps.storage.put(keys.smallKey, images.small, { contentType: 'image/webp' });
      await eraseProfilePhoto(tx, deps.storage, userId);
      await tx.consent.create({
        data: {
          userId,
          documentType: 'PROFILE_PHOTO_VISIBILITY',
          createdAt: await nextPhotoConsentTime(tx, userId),
          version: PHOTO_VERSION,
          granted: true,
        },
      });
      await tx.profilePhoto.create({ data: { userId, ...keys } });
    });
  } catch (error) {
    await deps.storage.delete(keys.largeKey);
    await deps.storage.delete(keys.smallKey);
    throw error;
  }
  return { saved: true as const };
}

/** K-07 + rıza her istekte taze okunur. Anahtar ve dosya varlığı yetkisize çıkmaz. */
export async function readProfilePhoto(
  deps: PhotoDeps,
  viewerId: string,
  ownerId: string,
  size: 96 | 512,
) {
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    const viewer = await permissions(tx, viewerId, now).requireUser();
    await requireConsent(tx, viewerId);
    const owner = await loadActor(tx, ownerId, now);
    const viewUniversities = await viewerUniversityIds(tx, viewer);
    const ownerUniversities = owner ? await viewerUniversityIds(tx, owner) : [];
    const consent = await decision(tx, ownerId);
    const photo = await tx.profilePhoto.findUnique({
      where: { userId: ownerId },
      select: { largeKey: true, smallKey: true },
    });
    if (
      !photo ||
      !canViewProfilePhoto({
        consent: consent?.granted === true && consent.version === PHOTO_VERSION,
        ownerActive: owner?.facts.accountStatus === 'ACTIVE',
        viewerActive: viewer.facts.accountStatus === 'ACTIVE',
        isOwner: viewerId === ownerId,
        sameUniversity: viewUniversities.some((id) => ownerUniversities.includes(id)),
      })
    )
      throw codedNotFound('RESOURCE_NOT_FOUND');
    const bytes = await deps.storage.get(size === 512 ? photo.largeKey : photo.smallKey);
    if (!bytes) throw codedNotFound('RESOURCE_NOT_FOUND');
    return bytes;
  });
}

/** Yönetici rolü hedef bölümünü kapsamadan fotoğraf silemez; gerekçe ve kayıt aynı işlemde. */
export async function moderateProfilePhoto(
  deps: PhotoDeps,
  adminId: string,
  input: { userId: string; reason: string },
) {
  const parsed = removeProfilePhotoSchema.safeParse(input);
  if (!parsed.success) throw codedValidation('VALIDATION_INVALID');
  const now = (deps.now ?? (() => new Date()))();
  return deps.db.$transaction(async (tx) => {
    // Kimlik sırası: iki yönlü aynı anda moderasyon kilit döngüsü oluşturmaz.
    const ids = [...new Set([adminId, input.userId])].sort();
    for (const id of ids) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${id} FOR UPDATE`;
    const admin = await loadAnyAdmin(tx, adminId, now);
    const memberships = await tx.membership.findMany({
      where: { userId: input.userId, endedAt: null },
      select: { departmentId: true },
    });
    const scope: boolean[] = [];
    for (const membership of memberships)
      scope.push(await covers(tx, admin, membership.departmentId));
    if (!isSystem(admin) && !scope.some(Boolean)) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (!(await tx.profilePhoto.findUnique({ where: { userId: input.userId } })))
      return { removed: true as const };
    await recordAdminAction(tx, {
      actor: admin,
      action: 'PROFILE_PHOTO_REMOVE',
      targetType: 'USER',
      targetId: input.userId,
      reason: input.reason,
    });
    await eraseProfilePhoto(tx, deps.storage, input.userId);
    return { removed: true as const };
  });
}

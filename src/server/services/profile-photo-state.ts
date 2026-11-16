import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { getConsentState } from './privacy';
import { photoSources } from './photo-presentation';
import { getUserDetail } from './admin-panel';

export async function myPhotoState(db: PrismaClient, userId: string) {
  const photo = await db.profilePhoto.findUnique({ where: { userId }, select: { userId: true } });
  const state = await getConsentState(db, userId);
  const consent = state.documents.find((item) => item.documentType === 'PROFILE_PHOTO_VISIBILITY');
  const consentGranted =
    consent?.lastDecision?.granted === true &&
    consent.lastDecision.version === consent.currentVersion;
  return { userId, hasPhoto: !!photo && consentGranted, consentGranted };
}
export async function photoModerationState(db: PrismaClient, adminId: string, userId: string) {
  // Aynı yönetim kaydı kapısı: kapsam dışı kullanıcıya fotoğraf varlığı dahi açılmaz.
  await getUserDetail({ db }, adminId, { userId });
  const photo = await db.profilePhoto.findUnique({ where: { userId }, select: { userId: true } });
  if (!photo) return { exists: false as const };
  const sources = await photoSources(db, [userId], { viewerId: adminId });
  return { exists: true as const, photoSrc: sources.get(userId) };
}

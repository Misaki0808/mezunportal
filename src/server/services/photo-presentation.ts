import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import { profilePhotoHref } from '@/contracts/profile-photo';
import { accountStatusOf } from '../rules/authorization';
import { canViewProfilePhoto } from '../rules/visibility';

type PhotoReader = Pick<Prisma.TransactionClient, 'profilePhoto' | 'user'>;
/** İsimli kartlara yalnız görülebilir fotoğraf adresi ekler; anonim kart kimliği bu işleve verilmez. Tek toplu fotoğraf sorgusu. */
export async function photoSources(
  db: PhotoReader,
  userIds: readonly string[],
  input: { viewerId?: string; universities?: readonly string[] },
  now = new Date(),
) {
  const result = new Map<string, string>();
  if (!userIds.length) return result;
  let universities = input.universities;
  if (!universities) {
    const viewer = input.viewerId
      ? await db.user.findUnique({
          where: { id: input.viewerId },
          select: {
            banned: true,
            deletedAt: true,
            banExpires: true,
            memberships: {
              where: { endedAt: null, verificationStatus: 'VERIFIED' },
              select: { department: { select: { faculty: { select: { universityId: true } } } } },
            },
          },
        })
      : null;
    if (!viewer || accountStatusOf(viewer, now) !== 'ACTIVE') return result;
    universities = viewer.memberships.map((m) => m.department.faculty.universityId);
  }
  const photos = await db.profilePhoto.findMany({
    where: { userId: { in: [...userIds] } },
    select: {
      userId: true,
      updatedAt: true,
      user: {
        select: {
          banned: true,
          deletedAt: true,
          banExpires: true,
          memberships: {
            where: { endedAt: null, verificationStatus: 'VERIFIED' },
            select: { department: { select: { faculty: { select: { universityId: true } } } } },
          },
          consents: {
            where: { documentType: 'PROFILE_PHOTO_VISIBILITY' },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { granted: true, version: true },
          },
        },
      },
    },
  });
  for (const photo of photos) {
    const consent = photo.user.consents[0];
    if (
      canViewProfilePhoto({
        consent:
          consent?.granted === true &&
          consent.version === CURRENT_CONSENT_VERSIONS.PROFILE_PHOTO_VISIBILITY,
        viewerActive: true,
        ownerActive: accountStatusOf(photo.user, now) === 'ACTIVE',
        isOwner: input.viewerId === photo.userId,
        sameUniversity: photo.user.memberships.some((m) =>
          universities!.includes(m.department.faculty.universityId),
        ),
      })
    )
      result.set(photo.userId, `${profilePhotoHref(photo.userId)}&v=${photo.updatedAt.getTime()}`);
  }
  return result;
}

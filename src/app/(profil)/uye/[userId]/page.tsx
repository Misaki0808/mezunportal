import { getTranslations } from 'next-intl/server';
import { getDb } from '@/server/db';
import { Badge } from '@/components/ui';
import { MentorEntryPoints } from '@/components/mentors/mentor-entry-points';
import { getMentorEntryPoints } from '@/server/actions/mentor-directory';
import { ProfileView } from '@/components/profile/profile-view';
import { ErrorState } from '@/components/ui';
import { getCvReviewAvailability } from '@/server/actions/cv-review-request';
import { getProfile } from '@/server/actions/profile-content';

export const dynamic = 'force-dynamic';
export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const result = await getProfile({ userId }).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const [entry, availability] = await Promise.all([
    getMentorEntryPoints({ userId }).catch(() => null),
    getCvReviewAvailability({ mentorId: userId }).catch(() => null),
  ]);
  const [count, t] = await Promise.all([
    getDb().referralClaim.count({
      where: {
        alumnusId: userId,
        approvedAt: { not: null },
        status: { notIn: ['CANCELLED', 'REJECTED'] },
      },
    }),
    getTranslations('referrals'),
  ]);
  return (
    <>
      <div className="mx-auto max-w-2xl px-5 pt-4">
        <Badge>{t('profileCount', { count })}</Badge>
      </div>
      <ProfileView profile={result.data} />
      {entry?.ok && (
        <div className="mx-auto max-w-2xl px-5 pb-28">
          <MentorEntryPoints
            userId={userId}
            entry={entry.data}
            cvAvailability={availability?.ok ? availability.data : null}
          />
        </div>
      )}
    </>
  );
}

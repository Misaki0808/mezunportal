import { ProfileView } from '@/components/profile/profile-view';
import { ErrorState } from '@/components/ui';
import { ReviewRequestEntry } from '@/components/cv-review/request-entry';
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
  // Var olmayan, silinmiş ya da görünmeyen kullanıcı aynı yanıtı alır (sunucu RESOURCE_NOT_FOUND döner).
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const availability = await getCvReviewAvailability({ mentorId: userId }).catch(() => null);
  const entry = availability?.ok ? availability.data : null;
  const showEntry = entry && !['NOT_MENTOR', 'SELF'].includes(entry.reason ?? '');
  return (
    <>
      <ProfileView profile={result.data} />
      {showEntry && (
        <div className="mx-auto max-w-2xl px-5 pb-28">
          <ReviewRequestEntry mentorId={userId} availability={entry} />
        </div>
      )}
    </>
  );
}

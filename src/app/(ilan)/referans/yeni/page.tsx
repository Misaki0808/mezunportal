import { ReferralCreate } from '@/components/referrals/referral-ui';
import { ErrorState } from '@/components/ui';
import { listMyJobPostings } from '@/server/actions/job-postings';
import { listReferralCandidates } from '@/server/actions/referrals';
export const dynamic = 'force-dynamic';
export default async function NewReferralPage() {
  const [result, jobs] = await Promise.all([
    listReferralCandidates(),
    listMyJobPostings({ status: 'PUBLISHED', limit: 50 }),
  ]);
  return result.ok ? (
    <ReferralCreate
      candidates={result.data}
      postings={
        jobs.ok
          ? jobs.data.items.map((item) => ({
              id: item.id,
              title: item.title ?? '',
              organization: item.organizationName ?? '',
            }))
          : []
      }
    />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}

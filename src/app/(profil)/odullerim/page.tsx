import { ErrorState } from '@/components/ui';
import { MyAwards } from '@/components/year-alumni/my-awards';
import { listMyAwards } from '@/server/actions/year-alumni';
export const dynamic = 'force-dynamic';
export default async function MyAwardsPage() {
  const result = await listMyAwards();
  return result.ok ? (
    <MyAwards awards={result.data} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}

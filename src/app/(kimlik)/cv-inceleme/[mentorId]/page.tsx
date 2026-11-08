import { getCvReviewAvailability } from '@/server/actions/cv-review-request';
import { ErrorState } from '@/components/ui';
import { RequestForm } from '@/components/cv-review/request-form';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ mentorId: string }> }) {
  const { mentorId } = await params;
  const result = await getCvReviewAvailability({ mentorId });
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return <RequestForm mentorId={mentorId} availability={result.data} />;
}

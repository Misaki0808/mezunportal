import { ErrorState } from '@/components/ui';
import { FeedbackForm } from '@/components/feedback/feedback-form';
import { getRequestFeedbackView } from '@/app/(kimlik)/feedback-view';
export const dynamic = 'force-dynamic';
export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getRequestFeedbackView(id);
  return result.ok ? (
    <FeedbackForm view={result.data} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}

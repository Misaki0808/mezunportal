import { ErrorState } from '@/components/ui';
import { SeekerContact } from '@/components/job-seekers/contact';
import { previewSeekerContact } from '@/server/actions/job-seekers';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const result = await previewSeekerContact({ ref });
  return result.ok ? (
    <SeekerContact candidateRef={ref} preview={result.data} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}

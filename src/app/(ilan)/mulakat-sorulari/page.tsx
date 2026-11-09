import { QuestionBank } from '@/components/interview-questions/question-bank';
import { ErrorState } from '@/components/ui';
import { interviewQuerySchema } from '@/contracts/interview-questions';
import { getInterviewQuestions } from '@/server/actions/interview-questions';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = interviewQuerySchema.safeParse({
    q: raw.q ?? '',
    companyId: raw.companyId ?? '',
    sectorId: raw.sectorId ?? '',
  });
  if (!parsed.success) return <ErrorState errorCode="VALIDATION_INVALID" />;
  const filters = parsed.data;
  const result = await getInterviewQuestions(filters);
  return result.ok ? (
    <QuestionBank data={result.data} filters={filters} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}

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
    q: typeof raw.q === 'string' ? raw.q : '',
    companyId: typeof raw.companyId === 'string' ? raw.companyId : '',
    sectorId: typeof raw.sectorId === 'string' ? raw.sectorId : '',
  });
  const filters = parsed.success ? parsed.data : interviewQuerySchema.parse({});
  const result = await getInterviewQuestions(filters);
  return result.ok ? (
    <QuestionBank data={result.data} filters={filters} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}

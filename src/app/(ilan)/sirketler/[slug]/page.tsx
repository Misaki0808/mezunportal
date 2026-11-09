import { CompanyScreen } from '@/components/companies/company-screens';
import { ErrorState } from '@/components/ui';
import { getCompany } from '@/server/actions/companies';
import { getInterviewQuestions } from '@/server/actions/interview-questions';
import { getApplicationCalendar } from '@/server/actions/application-window';
export const dynamic = 'force-dynamic';
export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getCompany({ slug });
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const [questions, calendar] = await Promise.all([
    getInterviewQuestions({ companyId: result.data.id }),
    getApplicationCalendar({ kind: 'COMPANY', id: result.data.id }),
  ]);
  if (!questions.ok) return <ErrorState errorCode={questions.errorCode} />;
  if (!calendar.ok) return <ErrorState errorCode={calendar.errorCode} />;
  return (
    <CompanyScreen company={result.data} questions={questions.data} calendar={calendar.data} />
  );
}

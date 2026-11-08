import { CompanyScreen } from '@/components/companies/company-screens';
import { ErrorState } from '@/components/ui';
import { getCompany } from '@/server/actions/companies';
export const dynamic = 'force-dynamic';
export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getCompany({ slug });
  return result.ok ? (
    <CompanyScreen company={result.data} />
  ) : (
    <ErrorState errorCode={result.errorCode} />
  );
}

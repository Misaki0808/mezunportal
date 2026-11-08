import { CompanyMerge } from '@/components/companies/company-screens';
import { adminAccess } from '@/components/admin/access';
import { ErrorState } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function MergeCompaniesPage() {
  const access = await adminAccess('dictionaries');
  return access.ok ? <CompanyMerge /> : <ErrorState errorCode={access.errorCode} />;
}

import { ErrorState } from '@/components/ui';
import { SeekerSearch } from '@/components/job-seekers/search';
import { getMyHiringDeclaration } from '@/server/actions/job-seekers';
import { listSelectableDepartments } from '@/server/actions/auth';
import { listProfileTags } from '@/server/actions/profile';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const [declaration, departments, tags] = await Promise.all([
    getMyHiringDeclaration(),
    listSelectableDepartments(),
    listProfileTags({ kind: 'INTEREST' }),
  ]);
  if (!declaration.ok) return <ErrorState errorCode={declaration.errorCode} />;
  if (!departments.ok) return <ErrorState errorCode={departments.errorCode} />;
  if (!tags.ok) return <ErrorState errorCode={tags.errorCode} />;
  return (
    <SeekerSearch
      initial={declaration.data}
      departments={departments.data.departments}
      tags={tags.data.tags}
    />
  );
}

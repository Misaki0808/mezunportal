import { ErrorState } from '@/components/ui';
import { MyExperiences } from '@/components/experience/my-experiences';
import { listMyExperiences } from '@/server/actions/experience';

export const dynamic = 'force-dynamic';

export default async function MyExperiencesPage() {
  const result = await listMyExperiences({}).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return <MyExperiences initial={result.data} list={listMyExperiences} />;
}

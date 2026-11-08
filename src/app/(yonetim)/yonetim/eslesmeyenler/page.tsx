import { adminAccess } from '@/components/admin/access';
import { UnmatchedValues } from '@/components/admin/unmatched';
import { ErrorState } from '@/components/ui';
import { listUnmatchedValues, resolveUnmatchedValue } from '@/server/actions/admin';
export const dynamic = 'force-dynamic';
export default async function UnmatchedPage() {
  const access = await adminAccess('unmatchedValues');
  if (!access.ok) return <ErrorState errorCode={access.errorCode} />;
  const result = await listUnmatchedValues({}).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <UnmatchedValues
      initial={result.data}
      list={listUnmatchedValues}
      resolve={resolveUnmatchedValue}
    />
  );
}

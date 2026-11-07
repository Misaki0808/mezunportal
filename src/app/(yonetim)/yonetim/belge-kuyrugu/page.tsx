import { hasAdminAccess } from '@/components/layout/admin-access';
import { ErrorState } from '@/components/ui';
import {
  listPendingGraduationDocuments,
  reviewGraduationDocument,
} from '@/server/actions/graduation-document';

import { ReviewQueue } from './review-queue';

export const dynamic = 'force-dynamic';

export default async function GraduationQueuePage() {
  if (!(await hasAdminAccess())) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const result = await listPendingGraduationDocuments().catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <ReviewQueue
      initial={result.data}
      list={listPendingGraduationDocuments}
      review={reviewGraduationDocument}
    />
  );
}

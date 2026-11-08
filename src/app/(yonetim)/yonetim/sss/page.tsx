import { hasAdminAccess } from '@/components/layout/admin-access';
import { AdminFrame } from '@/components/admin/frame';
import { FaqModerationQueue } from '@/components/faq/moderation-queue';
import { ErrorState } from '@/components/ui';
import { listFaqModerationQueue, publishFaq, redirectFaq, rejectFaq } from '@/server/actions/faq';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function FaqModerationPage() {
  if (!(await hasAdminAccess())) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const result = await listFaqModerationQueue({}).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const t = await getTranslations('faq.moderation');
  return (
    <AdminFrame title={t('title')} description={t('description')}>
      <FaqModerationQueue
        initial={result.data}
        actions={{
          list: listFaqModerationQueue,
          publish: publishFaq,
          reject: rejectFaq,
          redirect: redirectFaq,
        }}
      />
    </AdminFrame>
  );
}

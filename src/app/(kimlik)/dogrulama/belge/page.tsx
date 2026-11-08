import { getTranslations } from 'next-intl/server';

import { ErrorState, PageHeader } from '@/components/ui';
import { listSelectableDepartments } from '@/server/actions/auth';
import { uploadGraduationDocument } from '@/server/actions/graduation-document';

import { DocumentForm } from './document-form';

export const dynamic = 'force-dynamic';
export default async function GraduationDocumentPage() {
  const t = await getTranslations('authScreens.document');
  const result = await listSelectableDepartments().catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-10 sm:pt-16">
      <PageHeader
        className="mb-8"
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
      >
        <p className="mt-4 rounded-card bg-surface p-4 text-base text-fg-muted">{t('privacy')}</p>
      </PageHeader>
      <DocumentForm departments={result.data.departments} submit={uploadGraduationDocument} />
    </div>
  );
}

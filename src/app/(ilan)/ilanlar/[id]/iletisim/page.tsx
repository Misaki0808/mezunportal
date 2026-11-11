import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PostingContactForm } from '@/components/job-postings/contact';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui';
import { previewJobPostingContact, requestJobPostingContact } from '@/server/actions/job-postings';
export const dynamic = 'force-dynamic';
export default async function PostingContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('jobs');
  const result = await previewJobPostingContact({ jobPostingId: id });
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  if (!result.data.canRequest)
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        {/* Her durumda sayfanın tek h1'i vardır; "ulaşılamaz" durumunda EmptyState başlığı h2 olarak kalır. */}
        <PageHeader className="mb-6" title={t('contactTitle')} />
        <EmptyState
          title={t('contactUnavailable')}
          action={
            <Link
              href="/ilanlar"
              className="press-control inline-flex min-h-11 items-center justify-center rounded-control border border-border-control bg-bg px-4 font-medium text-fg"
            >
              {t('back')}
            </Link>
          }
        />
      </div>
    );
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href={`/ilanlar/${encodeURIComponent(id)}`}
        className="press-control inline-flex min-h-11 items-center font-semibold text-primary"
      >
        ← {t('back')}
      </Link>
      <PageHeader
        className="mb-6"
        eyebrow={result.data.organizationName}
        title={t('contactTitle')}
        description={result.data.postingTitle}
      >
        <p className="mt-2 text-fg-muted">{t('contactSubtitle')}</p>
      </PageHeader>
      <PostingContactForm
        postingId={id}
        requestableFields={result.data.requestableFields}
        send={requestJobPostingContact}
      />
    </div>
  );
}

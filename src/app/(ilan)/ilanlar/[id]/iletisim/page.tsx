import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PostingContactForm } from '@/components/job-postings/contact';
import { EmptyState, ErrorState, buttonClasses } from '@/components/ui';
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
        <EmptyState
          title={t('contactUnavailable')}
          action={
            <Link href="/ilanlar" className={buttonClasses({ variant: 'secondary' })}>
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
      <header className="mb-6">
        <p className="font-semibold text-accent-strong">{result.data.organizationName}</p>
        <h1 className="mt-2 text-3xl font-bold">{t('contactTitle')}</h1>
        <p className="mt-2 break-words font-semibold">{result.data.postingTitle}</p>
        <p className="mt-3 text-fg-muted">{t('contactSubtitle')}</p>
      </header>
      <PostingContactForm
        postingId={id}
        requestableFields={result.data.requestableFields}
        send={requestJobPostingContact}
      />
    </div>
  );
}

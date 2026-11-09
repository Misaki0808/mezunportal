import { getTranslations } from 'next-intl/server';
import { ErrorState, PageHeader } from '@/components/ui';
import { StoryShowcase } from '@/components/alumni-story/showcase';
import { listPublishedStories } from '@/server/actions/alumni-story';
export const dynamic = 'force-dynamic';
export default async function ArchivePage() {
  const t = await getTranslations('alumniStory');
  const result = await listPublishedStories();
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      <PageHeader title={t('archiveTitle')} description={t('intro')} />
      {result.data.length ? (
        result.data.map((story) => (
          <StoryShowcase key={`${story.id}-${story.month}`} story={story} showMonth />
        ))
      ) : (
        <p>{t('archiveEmpty')}</p>
      )}
    </main>
  );
}

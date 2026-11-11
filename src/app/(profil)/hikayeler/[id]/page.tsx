import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Avatar, Card, ErrorState, PageHeader } from '@/components/ui';
import { getPublishedStory } from '@/server/actions/alumni-story';
export const dynamic = 'force-dynamic';
export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params,
    t = await getTranslations('alumniStory');
  const result = await getPublishedStory({ storyId: id });
  if (!result.ok) {
    if (result.errorCode === 'RESOURCE_NOT_FOUND') notFound();
    return <ErrorState errorCode={result.errorCode} />;
  }
  const story = result.data;
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
      <PageHeader eyebrow={t('title')} title={story.name} description={story.department} />
      <Card className="space-y-5 p-6">
        <span className="inline-block rounded-full bg-primary p-1">
          <Avatar name={story.name} decorative size="lg" className="bg-bg text-fg" />
        </span>
        <p className="whitespace-pre-wrap break-words text-lg leading-relaxed">{story.body}</p>
      </Card>
      <Link
        className="inline-flex min-h-11 items-center font-semibold text-primary underline"
        href="/hikayeler"
      >
        {t('back')}
      </Link>
    </div>
  );
}

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { PublishedStory } from '@/contracts/alumni-story';
import { Avatar, Card, IconChip, UsersIcon } from '@/components/ui';

export async function StoryShowcase({
  story,
  showMonth = false,
}: {
  story: PublishedStory;
  showMonth?: boolean;
}) {
  const t = await getTranslations('alumniStory');
  const [year, month] = story.month.split('-').map(Number);
  const monthLabel = new Intl.DateTimeFormat('tr-TR', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, 1)));
  return (
    <section aria-label={t('title')}>
      <Card className="relative overflow-hidden p-6">
        <div className="relative space-y-4">
          <p className="font-semibold text-primary">{t('title')}</p>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary p-1">
              <Avatar name={story.name} decorative size="lg" className="bg-bg text-fg" />
            </span>
            <div>
              <h2 className="text-xl font-semibold">{story.name}</h2>
              <p className="text-fg-muted">
                {story.department}
                {showMonth ? ` · ${monthLabel}` : ''}
              </p>
            </div>
          </div>
          <blockquote className="break-words text-lg leading-relaxed">
            “{story.body.length > 190 ? `${story.body.slice(0, 190).trimEnd()}…` : story.body}”
          </blockquote>
          <Link
            href={`/hikayeler/${encodeURIComponent(story.id)}`}
            className="press-control inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
          >
            {t('read')} →
          </Link>
        </div>
      </Card>
    </section>
  );
}
export async function StoryInvite() {
  const t = await getTranslations('alumniStory');
  return (
    <Link
      href="/hesap/hikayem"
      className="press-row flex min-h-20 items-center gap-4 rounded-card border border-border p-5"
    >
      <IconChip tone="accent">
        <UsersIcon />
      </IconChip>
      <span>
        <span className="block font-semibold">{t('share')}</span>
        <span className="block text-fg-muted">{t('shareDescription')}</span>
      </span>
    </Link>
  );
}

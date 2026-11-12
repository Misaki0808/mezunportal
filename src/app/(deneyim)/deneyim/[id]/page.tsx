import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { findAnonymousOwnership } from '@/components/experience/anonymous-ownership';
import { ExperienceContent } from '@/components/experience/experience-content';
import { ReportExperience } from '@/components/experience/report-sheet';
import { StatusBadge } from '@/components/experience/status-badge';
import { Badge, buttonClasses, ErrorState } from '@/components/ui';
import { listMyExperiences, reportExperience } from '@/server/actions/experience';
import { requestExperienceDetail } from '@/app/detail-route';
import { requireUser } from '@/server/permissions';

export const dynamic = 'force-dynamic';

export default async function ExperienceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, actor, t] = await Promise.all([
    requestExperienceDetail(id).catch(() => null),
    requireUser().catch(() => null),
    getTranslations('experiences'),
  ]);
  if (!detail) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!detail.ok) return <ErrorState errorCode={detail.errorCode} />;
  const experience = detail.data;
  const content = experience.content as { organizationName?: string };
  // Adlı deneyimde yazar sunucu yanıtındadır; anonimde yanıtta yazar alanı hiç yoktur.
  const author = experience.isAnonymous ? null : experience.author;
  const isOwner = experience.isAnonymous
    ? await findAnonymousOwnership(experience, listMyExperiences)
    : author !== null && actor?.userId === author.id;
  const editable = isOwner && (experience.status === 'DRAFT' || experience.status === 'REJECTED');
  const date = (value: Date) =>
    new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date(value));
  return (
    <article className="mx-auto w-full max-w-2xl px-5 pb-8 pt-10 sm:pt-16">
      {/* Okuyucu listeye (aradığı yere), yazar kendi deneyimlerine döner. */}
      <Link
        href={isOwner === true ? '/deneyimlerim' : '/deneyimler'}
        className="press-row mb-6 inline-flex min-h-11 items-center text-base font-medium text-primary"
      >
        ← {isOwner === true ? t('detail.backMine') : t('detail.backList')}
      </Link>
      <p className="text-base font-semibold text-primary">{t('detail.eyebrow')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={experience.status} />
        <Badge tone="category">{t(`types.${experience.content.type}`)}</Badge>
      </div>
      <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight text-fg">
        {content.organizationName ?? t('mine.untitled')}
      </h1>
      <p className="mt-2 text-base text-fg-muted">
        {author ? t('detail.by', { name: author.displayName }) : t('detail.anonymousAuthor')}
      </p>
      {experience.publishedAt && (
        <p className="text-sm text-fg-muted">
          {t('detail.published', { date: date(experience.publishedAt) })}
        </p>
      )}
      {experience.status === 'REJECTED' && experience.moderationNote && (
        <section className="mt-6 rounded-card border border-danger bg-danger-soft p-4 text-on-danger-soft">
          <h2 className="text-base font-semibold">{t('rejection.title')}</h2>
          <p className="mt-1 whitespace-pre-line text-base">{experience.moderationNote}</p>
        </section>
      )}
      <div className="mt-8">
        <ExperienceContent content={experience.content} showOrganization={false} />
      </div>
      <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6">
        {editable && (
          <Link
            className={buttonClasses({ size: 'lg', fullWidth: true })}
            href={`/deneyim/${experience.id}/duzenle`}
          >
            {t('detail.edit')}
          </Link>
        )}
        {experience.status === 'PUBLISHED' && isOwner === false && (
          <ReportExperience experienceId={experience.id} report={reportExperience} />
        )}
      </div>
    </article>
  );
}

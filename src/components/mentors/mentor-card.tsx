import { useTranslations } from 'next-intl';
import Link from 'next/link';

import type { MentorCard as MentorCardData } from '@/contracts/mentor-directory';
import { Avatar, Badge, buttonClasses, cn } from '@/components/ui';
import { withReturnPath } from '@/lib/return-path';
import { MentorAvailabilityBadge } from './mentor-availability-badge';

import type messages from '../../../messages/tr.json';

type TopicKey = keyof typeof messages.profileTags;

/** Mentor kartı: başlık, şirket/unvan, konular, müsaitlik rozeti (renk + metin), kapasite. E-posta/telefon yoktur. */
export function MentorCard({
  mentor,
  compact = false,
  returnTo,
}: {
  mentor: MentorCardData;
  compact?: boolean;
  /** Kartın bulunduğu sayfa (yol + sorgu): "İletişim iste" sayfasının geri bağlantısı buraya döner (`?donus=`). */
  returnTo?: string;
}) {
  const t = useTranslations('mentors');
  const tags = useTranslations('profileTags');
  const ui = useTranslations('ui');
  // Aynı adlı eylem bağlantıları kartın sahibiyle ayırt edilir: "Profili gör: Ad" (görünen metin değişmez).
  const named = (key: 'card.profile' | 'card.appointment' | 'card.contact') =>
    ui('namedAction', { action: t(key), target: mentor.displayName });
  const { availability, capacity } = mentor;
  const topics = mentor.topics.filter((slug) => tags.has(slug as TopicKey));

  return (
    <article className="flex h-full min-w-0 flex-col rounded-card border border-border bg-surface p-[18px] shadow-card [overflow-wrap:anywhere]">
      {/* Önce KİM: baş harf avatarı + ad + güncel konum; müsaitlik ve tür rozetleri hemen altında. */}
      <div className="flex items-start gap-3">
        <Avatar
          name={mentor.displayName}
          size="md"
          className={compact ? undefined : '!size-12'}
          decorative
        />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-bold text-fg">{mentor.displayName}</h3>
          {mentor.position && (
            <p className="mt-0.5 break-words text-sm text-fg">
              {mentor.position.title} · {mentor.position.company}
            </p>
          )}
          {mentor.headline && (
            <p className="mt-0.5 break-words text-sm text-fg-muted">{mentor.headline}</p>
          )}
          <p className="mt-0.5 text-sm text-fg-muted">{mentor.departmentName}</p>
          {mentor.sectorName && (
            <p className="text-sm text-fg-muted">{t('card.sector', { name: mentor.sectorName })}</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MentorAvailabilityBadge availability={availability} />
        <Badge tone="category">
          {t(`types.${mentor.mentorType}`)}
          {mentor.graduationYear ? ` · ${mentor.graduationYear}` : ''}
        </Badge>
      </div>

      {!compact && (
        <>
          {topics.length > 0 && (
            <ul aria-label={t('card.topicsLabel')} className="mt-3 flex flex-wrap gap-2">
              {topics.map((slug) => (
                <li
                  key={slug}
                  className="rounded-full border border-border-control px-3 py-1 text-sm text-fg"
                >
                  {tags(slug as TopicKey)}
                </li>
              ))}
            </ul>
          )}
          {mentor.skills.length > 0 && (
            <ul aria-label={t('card.skillsLabel')} className="mt-2 flex flex-wrap gap-2">
              {mentor.skills.map((skill) => (
                <li
                  key={skill}
                  title={skill}
                  className="max-w-full truncate rounded-full bg-surface-strong px-3 py-1 text-sm text-fg"
                >
                  {skill}
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-3 grid gap-1 text-sm text-fg-muted">
            <div>
              <dt className="sr-only">{t('filters.meetingModes')}</dt>
              <dd>
                {mentor.meetingModes.map((mode) => t(`modes.${mode}`)).join(' · ')} ·{' '}
                {t('card.session', { minutes: mentor.sessionMinutes })}
              </dd>
            </div>
            <div>
              <dd>
                {t('card.capacity', { remaining: capacity.remaining, monthly: capacity.monthly })}
              </dd>
            </div>
            {mentor.cvReviewEnabled && (
              <div>
                <dd>{t('card.cvReview')}</dd>
              </div>
            )}
          </dl>
        </>
      )}

      {/* Müsait mentorda randevu birincil, profil ve iletişim ikincildir; dolu mentorda randevu gösterilmez. */}
      {(() => {
        const profileHref = `/uye/${mentor.userId}`;
        const contactHref = withReturnPath(`/iletisim-iste/${mentor.userId}`, returnTo);
        if (compact)
          return (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                className={buttonClasses({})}
                href={profileHref}
                aria-label={named('card.profile')}
              >
                {t('card.profile')}
              </Link>
            </div>
          );
        if (availability.available)
          return (
            <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
              <Link
                className={cn(buttonClasses({}), 'col-span-2 w-full sm:col-span-1')}
                href={`/randevu-al/${mentor.userId}`}
                aria-label={named('card.appointment')}
              >
                {t('card.appointment')}
              </Link>
              <Link
                className={cn(buttonClasses({ variant: 'secondary' }), 'w-full')}
                href={profileHref}
                aria-label={named('card.profile')}
              >
                {t('card.profile')}
              </Link>
              <Link
                className="press-control inline-flex min-h-11 items-center justify-center rounded-control px-3 text-sm font-semibold text-primary underline underline-offset-4 sm:col-span-2"
                href={contactHref}
                aria-label={named('card.contact')}
              >
                {t('card.contact')}
              </Link>
            </div>
          );
        return (
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <Link
              className={buttonClasses({ variant: 'secondary' })}
              href={contactHref}
              aria-label={named('card.contact')}
            >
              {t('card.contact')}
            </Link>
            <Link
              className={buttonClasses({ variant: 'secondary' })}
              href={profileHref}
              aria-label={named('card.profile')}
            >
              {t('card.profile')}
            </Link>
          </div>
        );
      })()}
    </article>
  );
}

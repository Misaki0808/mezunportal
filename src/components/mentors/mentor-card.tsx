import { useTranslations } from 'next-intl';
import Link from 'next/link';

import type { MentorCard as MentorCardData } from '@/contracts/mentor-directory';
import { Badge, buttonClasses } from '@/components/ui';
import { withReturnPath } from '@/lib/return-path';

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
  const date = (value: Date) =>
    new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date(value));
  const { availability, capacity } = mentor;
  const availabilityText = availability.available
    ? t('card.available')
    : availability.reason === 'PAUSED'
      ? availability.pausedUntil
        ? t('card.pausedUntil', { date: date(availability.pausedUntil) })
        : t('card.paused')
      : t('card.full');
  const topics = mentor.topics.filter((slug) => tags.has(slug as TopicKey));

  return (
    <article className="min-w-0 rounded-card border border-border bg-bg p-5 shadow-card [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={availability.available ? 'success' : 'warning'}>{availabilityText}</Badge>
        <Badge tone="info">{t(`types.${mentor.mentorType}`)}</Badge>
      </div>
      <h3 className="mt-3 break-words text-xl font-semibold text-fg">{mentor.displayName}</h3>
      {mentor.headline && <p className="mt-1 break-words text-base text-fg">{mentor.headline}</p>}
      {mentor.position && (
        <p className="mt-1 break-words text-base text-fg-muted">
          {mentor.position.title} · {mentor.position.company}
        </p>
      )}
      <p className="mt-1 text-sm text-fg-muted">
        {mentor.departmentName}
        {mentor.graduationYear ? ` · ${t('card.graduated', { year: mentor.graduationYear })}` : ''}
      </p>
      {mentor.sectorName && (
        <p className="text-sm text-fg-muted">{t('card.sector', { name: mentor.sectorName })}</p>
      )}

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

      {/* Eylem önceliği: uygunluk açıksa birincil "Randevu iste" tam genişlikte, "Profili gör" ve "İletişim iste" altında iki eşit
          sütunda ikincil; uygun değilse (ya da kompakt kartta) "Profili gör" birincildir. 360–390 px'te üç düğme düzgün iki satır. */}
      {(() => {
        const profileHref = `/uye/${mentor.userId}`;
        const contactHref = withReturnPath(`/iletisim-iste/${mentor.userId}`, returnTo);
        if (compact)
          return (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className={buttonClasses({})} href={profileHref}>
                {t('card.profile')}
              </Link>
            </div>
          );
        if (availability.available)
          return (
            <div className="mt-4 flex flex-col gap-2">
              <Link
                className={buttonClasses({ fullWidth: true })}
                href={`/randevu-al/${mentor.userId}`}
              >
                {t('card.appointment')}
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  className={buttonClasses({ variant: 'secondary', fullWidth: true })}
                  href={profileHref}
                >
                  {t('card.profile')}
                </Link>
                <Link
                  className={buttonClasses({ variant: 'secondary', fullWidth: true })}
                  href={contactHref}
                >
                  {t('card.contact')}
                </Link>
              </div>
            </div>
          );
        return (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className={buttonClasses({})} href={profileHref}>
              {t('card.profile')}
            </Link>
            <Link className={buttonClasses({ variant: 'secondary' })} href={contactHref}>
              {t('card.contact')}
            </Link>
          </div>
        );
      })()}
    </article>
  );
}

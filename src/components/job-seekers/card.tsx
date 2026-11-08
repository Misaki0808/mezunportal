'use client';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui';
import type { SeekerCard } from '@/contracts/job-seekers';
import type messages from '../../../messages/tr.json';

type Card = Omit<SeekerCard, 'ref'>;
export function SeekerCardView({ card }: { card: Card }) {
  const t = useTranslations('seekers');
  const labels = useTranslations('profileTags');
  const standing =
    card.classStanding.kind === 'GRADE'
      ? t('grade', { grade: card.classStanding.grade })
      : t(card.classStanding.kind === 'PREPARATORY' ? 'preparatory' : 'unknownGrade');
  return (
    <div className="min-w-0 rounded-card border border-border bg-surface p-5 shadow-card [overflow-wrap:anywhere]">
      <div className="flex flex-wrap gap-2">
        <Badge tone="category">{card.departmentName}</Badge>
        <Badge tone="info">{standing}</Badge>
      </div>
      {card.headline && <p className="mt-4 break-words text-lg font-semibold">{card.headline}</p>}
      {card.termYear && card.termSeason && (
        <p className="mt-3 text-sm text-fg-muted">
          {t('termValue', { year: card.termYear, season: t(`seasons.${card.termSeason}`) })}
        </p>
      )}
      {!!card.tags.length && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label={t('tags')}>
          {card.tags.map((tag) => (
            <li key={`${tag.kind}:${tag.slug}`}>
              <Badge tone="category">
                {labels.has(tag.slug as keyof typeof messages.profileTags)
                  ? labels(tag.slug as keyof typeof messages.profileTags)
                  : tag.slug}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

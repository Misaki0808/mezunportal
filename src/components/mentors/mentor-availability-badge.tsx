import { useTranslations } from 'next-intl';

import type { MentorCard } from '@/contracts/mentor-directory';
import { Badge } from '@/components/ui';

/** Dizin kartı ve üye profili, sunucunun aynı müsaitlik kararını aynı metinle gösterir. */
export function MentorAvailabilityBadge({
  availability,
}: {
  availability: MentorCard['availability'];
}) {
  const t = useTranslations('mentors.card');
  const text = availability.available
    ? t('available')
    : availability.reason === 'PAUSED'
      ? availability.pausedUntil
        ? t('pausedUntil', {
            date: new Intl.DateTimeFormat('tr-TR', {
              dateStyle: 'long',
              timeZone: 'Europe/Istanbul',
            }).format(new Date(availability.pausedUntil)),
          })
        : t('paused')
      : t('full');
  return <Badge tone={availability.available ? 'success' : 'warning'}>{text}</Badge>;
}

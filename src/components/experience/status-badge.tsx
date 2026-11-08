import { useTranslations } from 'next-intl';

import type { EXPERIENCE_STATUSES } from '@/contracts/experience';
import { Badge, type BadgeTone } from '@/components/ui';

type Status = (typeof EXPERIENCE_STATUSES)[number];
const TONES: Record<Status, BadgeTone> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  PUBLISHED: 'success',
  REJECTED: 'danger',
};

/** Durum rozeti: renk + metin birlikte (renk tek sinyal değil). */
export function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations('experiences.status');
  return <Badge tone={TONES[status]}>{t(status)}</Badge>;
}

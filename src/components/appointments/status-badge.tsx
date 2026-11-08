import { useTranslations } from 'next-intl';

import type { AppointmentStatus } from '@/contracts/appointment';
import { Badge, type BadgeTone } from '@/components/ui';

const TONES: Record<AppointmentStatus, BadgeTone> = {
  REQUESTED: 'warning',
  CONFIRMED: 'success',
  DECLINED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  COMPLETED: 'info',
  NO_SHOW: 'danger',
};

/** Durum rozeti: renk + metin birlikte. */
export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const t = useTranslations('appointments.status');
  return <Badge tone={TONES[status]}>{t(status)}</Badge>;
}

import { useTranslations } from 'next-intl';

import type { PointEntryView, PointStatus } from '@/contracts/points';
import { Badge, type BadgeTone } from '@/components/ui';

import { formatDate } from './format';

const STATUS_TONE: Record<PointStatus, BadgeTone> = {
  PENDING: 'warning',
  FINAL: 'success',
  REVOKED: 'neutral',
};

/**
 * Tek puan kaydı (katılımcı geçmişi ve yönetici kayıt listesi ortak). Sözleşme çıktısı kaynak/karşı taraf kimliği
 * taşımaz; burada da yalnız eylem türü, puan, durum ve tarih çizilir.
 */
export function PointEntryRow({ entry }: { entry: PointEntryView }) {
  const t = useTranslations('points');
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-base font-medium text-fg">
          {t(`actions.${entry.action}`)}
        </span>
        <span
          className={
            entry.status === 'REVOKED'
              ? 'text-base text-fg-muted line-through'
              : 'text-lg font-semibold text-fg'
          }
        >
          {t('pointsValue', { count: entry.points })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[entry.status]}>{t(`status.${entry.status}`)}</Badge>
        <span className="text-sm text-fg-muted">{formatDate(entry.createdAt)}</span>
      </div>
      {entry.status === 'PENDING' && entry.finalizesAt && (
        <p className="text-sm text-fg-muted">
          {t('finalizesAt', { date: formatDate(entry.finalizesAt) })}
        </p>
      )}
      {entry.multiplierPercent < 100 && entry.status !== 'REVOKED' && (
        <p className="text-sm text-fg-muted">
          {t('multiplier', { percent: entry.multiplierPercent, base: entry.basePoints })}
        </p>
      )}
      {entry.status === 'REVOKED' && entry.revokedReason && (
        <p className="text-sm text-fg-muted">{t(`revoked.${entry.revokedReason}`)}</p>
      )}
    </div>
  );
}

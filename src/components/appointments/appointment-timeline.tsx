'use client';

import { useTranslations } from 'next-intl';

import type { AppointmentView } from '@/contracts/appointment';
import { CheckIcon, CloseIcon, cn } from '@/components/ui';

import { buildTimeline, timelineHint, type TimelineStep } from './timeline';

type Props = {
  status: AppointmentView['status'];
  role: AppointmentView['role'];
  feedbackPending: boolean;
};

const DANGER_STOPS = new Set(['DECLINED', 'NO_SHOW']);

/**
 * Randevu yolu: talep → mentor onayı → görüşme → geri bildirim. Renk tek başına anlam taşımaz: her adımın yanında işaret
 * (✓, sayı, ✕) ve ekran okuyucu için durum metni vardır. 360 px'te dört sütun yan yana sığar; etiketler satır kırar.
 */
export function AppointmentTimeline({ status, role, feedbackPending }: Props) {
  const t = useTranslations('appointments.timeline');
  const steps = buildTimeline({ status }, feedbackPending);
  const hint = timelineHint({ status, role }, feedbackPending);
  const label = (item: TimelineStep) =>
    item.kind === 'stop' ? t(`stops.${item.id}`) : t(`steps.${item.id}`);

  return (
    <div className="flex flex-col gap-3">
      <ol aria-label={t('label')} className="flex items-start">
        {steps.map((item, index) => {
          const previous = steps[index - 1];
          const danger = item.kind === 'stop' && DANGER_STOPS.has(item.id);
          return (
            <li
              key={item.id}
              aria-current={item.state === 'current' ? 'step' : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 px-0.5 text-center"
            >
              {previous && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2',
                    previous.state === 'done' ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-bg text-sm font-semibold',
                  item.state === 'done' && 'border-primary bg-primary text-on-primary',
                  item.state === 'current' && 'border-primary text-primary',
                  item.state === 'upcoming' && 'border-border-control text-fg-muted',
                  item.state === 'stopped' &&
                    (danger
                      ? 'border-danger bg-danger-soft text-on-danger-soft'
                      : 'border-border-control bg-surface-strong text-fg-muted'),
                )}
              >
                {item.state === 'done' ? (
                  <CheckIcon width={16} height={16} strokeWidth={3} />
                ) : item.state === 'stopped' ? (
                  <CloseIcon width={16} height={16} strokeWidth={3} />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  'text-sm [overflow-wrap:anywhere]',
                  item.state === 'current' || item.state === 'stopped'
                    ? 'font-semibold text-fg'
                    : 'text-fg-muted',
                )}
              >
                {label(item)}
                <span className="sr-only"> ({t(`state.${item.state}`)})</span>
              </span>
            </li>
          );
        })}
      </ol>
      {hint && <p className="text-base text-fg-muted">{t(`hint.${hint}`)}</p>}
    </div>
  );
}

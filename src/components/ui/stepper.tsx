'use client';

import { useTranslations } from 'next-intl';

import { cn } from './cn';
import { CheckIcon } from './icons';

export type StepperProps = {
  steps: readonly { id: string; label: string }[];
  /** Şu anki adımın 0 tabanlı sırası. */
  current: number;
  className?: string;
};

/** Çok adımlı akış göstergesi. Mobilde “Adım 2 / 4: Ad” özeti, geniş ekranda tam liste. */
export function Stepper({ steps, current, className }: StepperProps) {
  const t = useTranslations('ui.stepper');
  const currentStep = steps[current];

  return (
    <nav aria-label={t('label')} className={cn('w-full', className)}>
      <div className="md:hidden">
        <p className="text-sm font-medium text-fg">
          {t('status', { current: current + 1, total: steps.length })}
          {currentStep ? `: ${currentStep.label}` : ''}
        </p>
        <div
          aria-hidden="true"
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-strong"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${((current + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
      <ol className="hidden items-center gap-2 md:flex">
        {steps.map((step, index) => {
          const done = index < current;
          const isCurrent = index === current;
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex flex-1 items-center gap-2 last:flex-none"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                  done && 'border-primary bg-primary text-on-primary',
                  isCurrent && 'border-primary text-primary',
                  !done && !isCurrent && 'border-border-control text-fg-muted',
                )}
              >
                {done ? <CheckIcon width={16} height={16} strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn('text-sm', isCurrent ? 'font-semibold text-fg' : 'text-fg-muted')}
              >
                {step.label}
                {done && <span className="sr-only"> ({t('done')})</span>}
                {isCurrent && <span className="sr-only"> ({t('current')})</span>}
              </span>
              {index < steps.length - 1 && (
                <span aria-hidden="true" className="h-0.5 min-w-4 flex-1 bg-border" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

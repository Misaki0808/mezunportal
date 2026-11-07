'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { buttonClasses } from './button';
import { cn } from './cn';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

export type PaginationProps = {
  /** Şu anki sayfa, 1 tabanlı. */
  page: number;
  pageCount: number;
  /** Düğme modu: durum istemcide tutulur. */
  onPageChange?: (page: number) => void;
  /** Bağlantı modu: sayfa URL'de tutulur (sunucu sayfaları); verilirse düğme yerine `<a>` olur. */
  hrefFor?: (page: number) => string;
  className?: string;
};

export function Pagination({ page, pageCount, onPageChange, hrefFor, className }: PaginationProps) {
  const t = useTranslations('ui.pagination');
  if (pageCount <= 1) return null;

  function control(target: number, label: string, icon: ReactNode, disabledReason: string) {
    const disabled = target < 1 || target > pageCount;
    const classes = cn(
      buttonClasses({ variant: 'secondary' }),
      disabled && 'cursor-not-allowed opacity-50',
    );
    const content = (
      <>
        {icon}
        <span className="sr-only sm:not-sr-only">{label}</span>
        {disabled && <span className="sr-only"> ({disabledReason})</span>}
      </>
    );

    if (hrefFor && !disabled) {
      return (
        <a href={hrefFor(target)} rel={target < page ? 'prev' : 'next'} className={classes}>
          {content}
        </a>
      );
    }
    return (
      <button
        type="button"
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : () => onPageChange?.(target)}
        className={classes}
      >
        {content}
      </button>
    );
  }

  return (
    <nav
      aria-label={t('label')}
      className={cn('flex items-center justify-between gap-3', className)}
    >
      {control(page - 1, t('previous'), <ChevronLeftIcon />, t('firstPage'))}
      <p aria-live="polite" className="text-sm text-fg-muted">
        {t('status', { page, total: pageCount })}
      </p>
      {control(page + 1, t('next'), <ChevronRightIcon />, t('lastPage'))}
    </nav>
  );
}

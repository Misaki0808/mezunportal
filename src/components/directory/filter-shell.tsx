'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { Button, Sheet, Skeleton } from '@/components/ui';

import { FilterChip } from './filter-chip';

export type ActiveFilter = { key: string; label: string; onRemove: () => void };

type Props = {
  /** Filtre alanları (mobilde alt sayfada, geniş ekranda kenar panelinde AYNI düğümler çizilir). */
  children: ReactNode;
  /** Etkin filtreler çip olarak listelenir; her çip tek dokunuşla kaldırılır. */
  active: readonly ActiveFilter[];
  total: number;
  /**
   * Filtreler uygulanır (URL'e yazılır). Geçersiz girdi `false` döner: alt sayfa AÇIK kalır ve alan hatası görünür
   * (kullanıcı hatayı göremeden sayfa kapanmaz).
   */
  onApply: () => boolean | void;
  /** Taslak seçimleri uygulanmış filtreye geri al (alt sayfa Vazgeç/kapat). */
  onReset: () => void;
  onClear: () => void;
  pending?: boolean;
  /** Sonuç listesi (yükleniyorken iskelet gösterilir). */
  results: ReactNode;
  /** Sonuçların üstünde, filtrelerden bağımsız öne çıkan bölüm (örn. “Sana benzer”). */
  lead?: ReactNode;
  pagination?: ReactNode;
};

/**
 * Dizin/arama ekranlarının ortak filtre düzeni (P1-08 arama ve P1-09 mentor dizini aynı desen): mobilde “Filtreler”
 * düğmesi + alt sayfa, ≥ lg'de sol kenar paneli; etkin filtre çipleri, sonuç sayısı (canlı bölge), temizle ve
 * iskelet durumu. Filtre durumu çağıranın URL'indedir; kabuk yalnız yerleşim ve etkileşimi taşır.
 */
export function FilterShell({
  children,
  active,
  total,
  onApply,
  onReset,
  onClear,
  pending,
  results,
  lead,
  pagination,
}: Props) {
  const t = useTranslations('directory');
  const [open, setOpen] = useState(false);

  function close() {
    onReset();
    setOpen(false);
  }

  return (
    <>
      <div className="mt-6 lg:hidden">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('filters')}
          {active.length > 0 ? ` (${active.length})` : ''}
        </Button>
      </div>
      <Sheet
        open={open}
        onClose={close}
        title={t('filters')}
        footer={
          <>
            <Button
              loading={pending}
              onClick={() => {
                if (onApply() !== false) setOpen(false);
              }}
            >
              {t('apply')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('cancel')}
            </Button>
          </>
        }
      >
        {children}
      </Sheet>
      <div className="mt-6 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-card border border-border p-5 lg:block">
          <h2 className="mb-5 text-lg font-semibold">{t('filters')}</h2>
          {children}
          <div className="mt-6">
            <Button fullWidth loading={pending} onClick={onApply}>
              {t('apply')}
            </Button>
          </div>
        </aside>
        <section aria-busy={pending} className="min-w-0">
          {lead}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold" aria-live="polite">
              {t('resultCount', { count: total })}
            </p>
            {active.length > 0 && (
              <Button variant="secondary" onClick={onClear}>
                {t('clear')}
              </Button>
            )}
          </div>
          {active.length > 0 && (
            <div aria-label={t('active')} className="mt-4 flex flex-wrap gap-2">
              {active.map((chip) => (
                <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
              ))}
            </div>
          )}
          {pending ? (
            <div className="mt-5 space-y-4" role="status">
              <span className="sr-only">{t('loading')}</span>
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            results
          )}
          {pagination}
        </section>
      </div>
    </>
  );
}

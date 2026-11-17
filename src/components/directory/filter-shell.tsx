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
  /** Hiç kayıt yokken ve filtre/arama yokken "0 sonuç" yazmaz (boş durum zaten durumu anlatır). */
  hideCount?: boolean;
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
  /**
   * Arama satırı: verilirse kabuk onu en üstte çizer ve telefondaki "Filtreler" düğmesini ona geçirir (satırda "Ara"nın yanına
   * girer: `[ara] [Ara] [Filtreler]`, ayrı satır kaplamaz). Verilmezse düğme kendi satırında kalır (mentor dizini).
   */
  search?: (filtersButton: ReactNode) => ReactNode;
  /** Hızlı süzgeç yongaları (tür vb.): arama satırının altında tek satır; telefonda kendi içinde kayar. */
  quick?: ReactNode;
};

/**
 * Dizin/arama ekranlarının ortak filtre düzeni (Görünüm A liste kalıbı): arama satırı, hızlı süzgeç yongaları; mobilde
 * “Filtreler” düğmesi + alt sayfa, ≥ lg'de “Diğer filtreler” açılır paneli (kenar paneli yok, sonuçlar tam genişlik); etkin filtre çipleri, sonuç sayısı (canlı bölge), temizle ve
 * iskelet durumu. Filtre durumu çağıranın URL'indedir; kabuk yalnız yerleşim ve etkileşimi taşır.
 */
export function FilterShell({
  children,
  active,
  total,
  hideCount = false,
  onApply,
  onReset,
  onClear,
  pending,
  results,
  lead,
  pagination,
  search,
  quick,
}: Props) {
  const t = useTranslations('directory');
  const [open, setOpen] = useState(false);
  const pendingState = pending
    ? { disabled: true as const, disabledReason: t('loading') }
    : { disabled: false as const };

  function close() {
    onReset();
    setOpen(false);
  }

  const filtersLabel = `${t('filters')}${active.length > 0 ? ` (${active.length})` : ''}`;

  return (
    <>
      {search ? (
        search(
          <Button
            variant="secondary"
            className="shrink-0 whitespace-nowrap lg:hidden"
            onClick={() => setOpen(true)}
          >
            {filtersLabel}
          </Button>,
        )
      ) : (
        <div className="mt-6 lg:hidden">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {filtersLabel}
          </Button>
        </div>
      )}
      <Sheet
        open={open}
        onClose={close}
        title={t('filters')}
        footer={
          <>
            <Button
              loading={pending}
              {...pendingState}
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
      {quick && (
        <div
          role="group"
          aria-label={t('filters')}
          className="mt-3 flex min-w-0 items-center gap-2 overflow-x-auto pb-2"
        >
          {quick}
        </div>
      )}
      <details className="mt-2 hidden lg:block">
        <summary className="press-control inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
          {t('more')}
        </summary>
        <div className="mt-3 rounded-card border border-border bg-surface p-5">
          {children}
          <div className="mt-5">
            <Button loading={pending} {...pendingState} onClick={onApply}>
              {t('apply')}
            </Button>
          </div>
        </div>
      </details>
      <div className="mt-4">
        <section aria-busy={pending} className="min-w-0">
          {lead}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {hideCount ? (
              <span aria-live="polite" />
            ) : (
              <p className="font-semibold" aria-live="polite">
                {t('resultCount', { count: total })}
              </p>
            )}
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
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status">
              <span className="sr-only">{t('loading')}</span>
              <Skeleton className="h-40" />
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

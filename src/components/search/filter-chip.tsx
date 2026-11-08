'use client';
import { useTranslations } from 'next-intl';
import { CloseIcon, IconButton } from '@/components/ui';

/** Etiket dar alanda kısalır; başlık ve kaldırma düğmesinin adı tam değeri taşır. */
export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useTranslations('ui.tag');
  return (
    <span className="inline-flex min-w-0 max-w-full items-center rounded-full border border-border-control bg-bg pl-3 text-sm text-fg">
      <span className="min-w-0 truncate" title={label}>
        {label}
      </span>
      <IconButton
        label={t('remove', { label })}
        icon={<CloseIcon width={16} height={16} />}
        onClick={onRemove}
        className="shrink-0"
      />
    </span>
  );
}

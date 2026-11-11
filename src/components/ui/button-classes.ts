import { cn } from './cn';

/**
 * Düğme sınıfları SAF bir yardımcıdır ve bilerek `'use client'` OLMAYAN bu dosyadadır: `button.tsx` istemci modülüdür ve
 * oradan dışa aktarılan işlev sunucu bileşeninde çağrılamaz ("Attempted to call buttonClasses() from the server").
 * Sunucu sayfaları `buttonClasses`'ı `@/components/ui` üzerinden buradan alır (`index.ts`).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
export type ButtonSize = 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border-control bg-bg text-fg hover:bg-surface-strong',
  // Hover'da zemin primary-soft olur: `primary` metni orada AA değil (4,34:1); `primary-hover` AA (5,8:1) → hover'da metin de koyulaşır.
  ghost: 'bg-transparent text-primary hover:bg-primary-soft hover:text-primary-hover',
  danger: 'bg-danger text-on-danger hover:bg-danger-hover',
  // Yıkıcı ama ikincil eylem (örn. listede "Sil"): çerçeve ve yazı tehlike renginde; onay penceresi birincil yıkıcı düğmedir.
  'danger-outline': 'border border-danger bg-bg text-danger hover:bg-surface-strong',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-12 px-6 text-lg',
};

/** Bağlantıları (`<a>`/`next/link`) düğme gibi biçimlemek için: dokunma hedefi ≥ 44 px, basınca küçülür. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean } = {}): string {
  return cn(
    'press-control inline-flex items-center justify-center gap-2 rounded-control font-medium',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && 'w-full',
  );
}

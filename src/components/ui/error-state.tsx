'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { ErrorCode } from '@/lib/errors';
import { EXPECTED_STATES, isExpectedState } from '@/lib/expected-states';
import { withReturnPath } from '@/lib/return-path';

import { Button, buttonClasses } from './button';
import { cn } from './cn';
import { AlertIcon, InfoIcon } from './icons';

export type ErrorStateProps = {
  /** Kararlı hata kodu; metin `errors.codes` kataloğundan gelir, ham `err.message` basılmaz. */
  errorCode: ErrorCode;
  onRetry?: () => void;
  className?: string;
  /**
   * Beklenen durumda tek eylemin hedefi (örn. yönetim sayfalarında "Yönetim paneline dön"). `label` verilmezse
   * kataloğun varsayılan eylem metni kullanılır.
   */
  action?: { href: string; label: string };
};

/**
 * Hata/durum ekranı. Beklenen durum kodları (`EXPECTED_STATES`: rol dışı sayfa, form henüz açılmadı…) alarm değildir:
 * nötr simge, `role="status"`, h1 durum başlığı ve tek eylem. Diğer kodlar gerçek hatadır: kırmızı simge + `role="alert"`
 * ("Bir sorun oluştu"). `onRetry` verilen (satır içi) kullanımlar her zaman hata görünümünü korur.
 */
export function ErrorState({ errorCode, onRetry, className, action }: ErrorStateProps) {
  const t = useTranslations('ui.errorState');
  const codes = useTranslations('errors.codes');
  const pathname = usePathname() ?? '';

  if (!onRetry && isExpectedState(errorCode)) {
    const expected = EXPECTED_STATES[errorCode];
    // Yönetim alt sayfalarında "ana sayfa" yerine panele dönülür (kapsam dışı sayfa bağlamı).
    const inAdmin = expected.action === 'home' && pathname.startsWith('/yonetim/');
    const target = action ?? {
      // Giriş gerekiyorsa bulunulan sayfa `?donus=` ile taşınır (güvenli yol değilse eklenmez); diğer durumlar sabit hedefe.
      href:
        errorCode === 'AUTH_UNAUTHENTICATED'
          ? withReturnPath(expected.href, pathname)
          : inAdmin
            ? '/yonetim'
            : expected.href,
      label: t(`actions.${inAdmin ? 'admin' : expected.action}`),
    };
    return (
      <div
        role="status"
        className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}
      >
        <span className="text-fg-subtle">
          <InfoIcon width={40} height={40} strokeWidth={1.5} />
        </span>
        <h1 className="text-xl font-semibold text-fg">{t(`expected.${errorCode}`)}</h1>
        <p className="max-w-prose text-fg-muted">{codes(errorCode)}</p>
        <Link href={target.href} className={cn(buttonClasses({ variant: 'secondary' }), 'mt-2')}>
          {target.label}
        </Link>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}
    >
      <span className="text-danger">
        <AlertIcon width={40} height={40} strokeWidth={1.5} />
      </span>
      <h2 className="text-lg font-semibold text-fg">{t('title')}</h2>
      <p className="max-w-prose text-fg-muted">{codes(errorCode)}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

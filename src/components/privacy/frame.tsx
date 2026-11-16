import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { AccountFrame } from '@/components/account/account-frame';

/** Gizlilik ve veriler alt sayfaları: ortak hesap çerçevesi, kendi üst etiketi ve geri metniyle. */
export async function PrivacyFrame({
  title,
  description,
  children,
  showBack = true,
  back,
}: {
  title: string;
  description: string;
  children: ReactNode;
  showBack?: boolean;
  /** Geri bağlantısı kaynağa dönsün (varsayılan: Hesabım). `href` güvenli site içi yol olmalıdır (`safeReturnPath`). */
  back?: { href: string };
}) {
  const t = await getTranslations('privacyScreens.common');
  return (
    <AccountFrame
      title={title}
      description={description}
      eyebrow={t('eyebrow')}
      back={back}
      backLabel={back ? t('backReturn') : t('back')}
      showBack={showBack}
      width="max-w-2xl"
    >
      {children}
    </AccountFrame>
  );
}

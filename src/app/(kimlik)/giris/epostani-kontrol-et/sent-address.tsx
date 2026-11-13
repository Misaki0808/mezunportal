'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

import { readSignInAddress } from '../sign-in-address';

const subscribe = () => () => {};

/**
 * Bağlantının gittiği adres (kullanıcının kendi yazdığı): yanlış yazdıysa fark etsin. Sunucuda ve ilk çizimde
 * boştur; adres bu sekmenin oturum belleğinden gelir (bkz. `sign-in-address.ts`). Maskelenmez: maske yazım hatasını gizlerdi.
 */
export function SentAddress() {
  const t = useTranslations('authScreens.checkEmail');
  const address = useSyncExternalStore(subscribe, readSignInAddress, () => null);
  if (!address) return null;
  return (
    <p className="mt-4 text-base text-fg-muted">
      {t('sentTo')}
      {/* Adres kendi satırında: uzun adres satır ortasından bölünmez, gerekirse yalnız sığmayınca kırılır. */}
      <strong className="mt-1 block font-semibold text-fg [overflow-wrap:anywhere]">
        {address}
      </strong>
    </p>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui';

export function DigestUnsubscribe() {
  const t = useTranslations('monthlyDigest');
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    fetch('/api/aylik-ozet/abonelikten-cik', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((response) => {
        if (!response.ok) throw new Error('REQUEST_FAILED');
        window.history.replaceState(null, '', window.location.pathname);
        setDone(true);
      })
      .catch(() => setFailed(true));
  }, []);
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <PageHeader title={t('unsubscribeTitle')} />
      <p className="mt-4" role="status">
        {failed ? t('unsubscribeError') : done ? t('unsubscribeDone') : t('unsubscribeLoading')}
      </p>
    </div>
  );
}

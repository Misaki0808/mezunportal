'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/** Kod parçası HTTP isteğine girmez; aynı sekmede giriş dönüşü için kısa süre tutulur. */
export function QrEntry() {
  const router = useRouter(),
    t = useTranslations('campusEvents');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const eventId = fragment.get('etkinlik') ?? '',
        code = fragment.get('kod') ?? '';
      window.history.replaceState(null, '', window.location.pathname);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId) ||
        !/^\d{6}$/.test(code)
      ) {
        setInvalid(true);
        return;
      }
      sessionStorage.setItem(
        'campus-event-checkin',
        JSON.stringify({ eventId, code, expiresAt: Date.now() + 120_000 }),
      );
      router.replace(`/etkinlikler/${eventId}`);
    }, 0);
    return () => clearTimeout(timer);
  }, [router]);
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <p role="status">{invalid ? t('qrInvalid') : t('qrLoading')}</p>
    </main>
  );
}

'use client';
import { safeClientAction } from '@/lib/safe-client-action';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getCampusEventCode } from '@/server/actions/campus-events';
import type { CampusEventCode } from '@/contracts/campus-events';

export function EventCode({ eventId }: { eventId: string }) {
  const t = useTranslations('campusEvents'),
    [value, setValue] = useState<CampusEventCode | null>(null),
    [now, setNow] = useState(0),
    [unavailable, setUnavailable] = useState(false);
  const refresh = useCallback(async () => {
    const result = await safeClientAction(() => getCampusEventCode({ eventId }));
    if (result.ok) {
      setNow(Date.now());
      setValue(result.data);
      setUnavailable(false);
    } else {
      setValue(null);
      setUnavailable(true);
    }
  }, [eventId]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => void refresh(), 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [refresh]);
  const seconds = value
    ? Math.max(0, Math.ceil((new Date(value.expiresAt).getTime() - now) / 1000))
    : 0;
  return (
    <section className="mt-8 text-center">
      <h2 className="text-2xl font-semibold">{t('codeTitle')}</h2>
      {value && seconds > 0 ? (
        <>
          <div className="mt-6 flex flex-col items-center justify-center gap-5 lg:flex-row">
            {/* Sunucunun ürettiği SVG veri URL'si; herhangi bir uzak görsel isteği yoktur. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(value.qrSvg)}`}
              alt={t('qrAlt')}
              width={280}
              height={280}
              className="h-auto w-[min(70vw,280px)] rounded-card bg-white p-3"
            />
            <p
              className="whitespace-nowrap text-6xl font-bold tracking-wider sm:text-7xl xl:text-8xl"
              aria-live="polite"
            >
              {value.code}
            </p>
          </div>
          <p className="mt-6 text-lg">{t('codeExpires', { seconds })}</p>
          <p className="mt-3 text-lg">{t('attendanceCount', { count: value.attendanceCount })}</p>
        </>
      ) : (
        <p className="mt-6" role="status">
          {unavailable ? t('codeInvalid') : t('checking')}
        </p>
      )}
    </section>
  );
}

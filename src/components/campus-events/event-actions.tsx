'use client';
import { safeClientAction } from '@/lib/safe-client-action';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { checkInCampusEvent, registerCampusEvent } from '@/server/actions/campus-events';

export function EventActions({
  eventId,
  registered,
  attended,
  full,
}: {
  eventId: string;
  registered: boolean;
  attended: boolean;
  full: boolean;
}) {
  const t = useTranslations('campusEvents'),
    errors = useTranslations('errors.codes'),
    router = useRouter();
  const [pending, start] = useTransition(),
    [code, setCode] = useState(''),
    [status, setStatus] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      const raw = sessionStorage.getItem('campus-event-checkin');
      if (!raw) return;
      try {
        const saved: unknown = JSON.parse(raw);
        if (
          saved &&
          typeof saved === 'object' &&
          'eventId' in saved &&
          'code' in saved &&
          'expiresAt' in saved &&
          saved.eventId === eventId &&
          typeof saved.code === 'string' &&
          /^\d{6}$/.test(saved.code) &&
          typeof saved.expiresAt === 'number' &&
          saved.expiresAt > Date.now()
        )
          setCode(saved.code);
      } catch {
        /* Bozuk yerel veri kullanılmaz. */
      }
      sessionStorage.removeItem('campus-event-checkin');
    }, 0);
    return () => clearTimeout(timer);
  }, [eventId]);
  function register() {
    start(async () => {
      const result = await safeClientAction(() => registerCampusEvent({ eventId }));
      setStatus(result.ok ? t('registered') : errors(result.errorCode));
      if (result.ok) router.refresh();
    });
  }
  function checkin() {
    start(async () => {
      const result = await safeClientAction(() => checkInCampusEvent({ eventId, code }));
      setStatus(result.ok && result.data.accepted ? t('checked') : t('codeInvalid'));
      if (result.ok && result.data.accepted) router.refresh();
    });
  }
  return (
    <div
      className={
        attended
          ? 'mt-6 space-y-4'
          : 'fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 space-y-3 border-t border-border bg-bg px-5 py-3 lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0'
      }
    >
      {!registered && (
        <button
          type="button"
          onClick={register}
          disabled={pending || full}
          className="min-h-12 w-full rounded-xl bg-primary px-4 font-semibold text-on-primary disabled:opacity-50"
        >
          {pending ? t('registering') : full ? t('full') : t('register')}
        </button>
      )}
      {registered && !attended && (
        <div className="space-y-2">
          <label htmlFor="campus-code" className="block font-semibold">
            {t('codeLabel')}
          </label>
          <p className="text-fg-muted">{t('codeHint')}</p>
          <input
            id="campus-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3"
          />
          <button
            type="button"
            onClick={checkin}
            disabled={pending || code.length !== 6}
            className="min-h-12 w-full rounded-xl bg-primary px-4 font-semibold text-on-primary disabled:opacity-50"
          >
            {pending ? t('checking') : t('submitCode')}
          </button>
        </div>
      )}
      {attended && <p>{t('checked')}</p>}
      {status && <p role="status">{status}</p>}
    </div>
  );
}

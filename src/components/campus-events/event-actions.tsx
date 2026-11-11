'use client';
import { safeClientAction } from '@/lib/safe-client-action';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Badge, Button, CheckIcon, Field, Input } from '@/components/ui';
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
    [codeError, setCodeError] = useState(''),
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
    // Düğme kapatılmaz: eksik kod alanın altında sebebiyle söylenir (docs/design.md "devre dışı sebebiyle").
    if (code.length !== 6) {
      setCodeError(t('codeNeeded'));
      return;
    }
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
        <Button
          size="lg"
          fullWidth
          loading={pending}
          onClick={register}
          {...(full
            ? { disabled: true as const, disabledReason: t('full') }
            : { disabled: false as const })}
        >
          {pending ? t('registering') : t('register')}
        </Button>
      )}
      {registered && !attended && (
        <div className="space-y-3">
          <Badge tone="success">{t('registeredBadge')}</Badge>
          <Field label={t('codeLabel')} hint={t('codeHint')} error={codeError || undefined}>
            {(control) => (
              <Input
                {...control}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCodeError('');
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
              />
            )}
          </Field>
          <Button size="lg" fullWidth loading={pending} onClick={checkin}>
            {pending ? t('checking') : t('submitCode')}
          </Button>
        </div>
      )}
      {attended && (
        <Badge tone="success" className="gap-1.5">
          <CheckIcon width={16} height={16} strokeWidth={3} />
          {t('attendedBadge')}
        </Badge>
      )}
      {status && (
        <p role="status" className="text-fg-muted">
          {status}
        </p>
      )}
    </div>
  );
}

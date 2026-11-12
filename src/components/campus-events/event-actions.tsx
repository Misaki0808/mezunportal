'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Badge, Button, CheckIcon, Field, Input, useAction } from '@/components/ui';
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
    router = useRouter(),
    action = useAction();
  const [code, setCode] = useState(''),
    [codeError, setCodeError] = useState('');
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
    void action.run(() => registerCampusEvent({ eventId }), {
      success: t('registered'),
      onOk: () => router.refresh(),
    });
  }
  function checkin() {
    // Düğme kapatılmaz: eksik kod alanın altında sebebiyle söylenir (docs/design.md "devre dışı sebebiyle").
    if (code.length !== 6) {
      setCodeError(t('codeNeeded'));
      return;
    }
    void action.run(() => checkInCampusEvent({ eventId, code }), {
      success: (data) => (data.accepted ? t('checked') : undefined),
      onOk: (data) => {
        // Kod yanlışsa ya da süresi dolduysa girilen değer korunur, sebep alanın altında söylenir.
        if (data.accepted) router.refresh();
        else setCodeError(t('codeInvalid'));
      },
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
          loading={action.busy}
          onClick={register}
          {...(full
            ? { disabled: true as const, disabledReason: t('full') }
            : { disabled: false as const })}
        >
          {action.busy ? t('registering') : t('register')}
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
          <Button size="lg" fullWidth loading={action.busy} onClick={checkin}>
            {action.busy ? t('checking') : t('submitCode')}
          </Button>
        </div>
      )}
      {attended && (
        <Badge tone="success" className="gap-1.5">
          <CheckIcon width={16} height={16} strokeWidth={3} />
          {t('attendedBadge')}
        </Badge>
      )}
      {action.error && (
        <p role="alert" className="text-danger">
          {action.error}
        </p>
      )}
    </div>
  );
}

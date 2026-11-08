'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef, useState } from 'react';

import type { AppointmentPage, ListMyAppointmentsInput } from '@/contracts/appointment';
import type { ActionResult } from '@/contracts/result';
import { Button, buttonClasses, EmptyState, Tabs } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { AppointmentStatusBadge } from './status-badge';
import { fullLabel, rangeLabel } from './time';

type Role = 'MENTOR' | 'MENTEE';
type Props = {
  initial: AppointmentPage;
  initialRole: Role;
  /** Mentor ayarları bağlantısı yalnız mentor olabilen kullanıcıya gösterilir. */
  showSettings: boolean;
  list: (input: ListMyAppointmentsInput) => Promise<ActionResult<AppointmentPage>>;
};

/** Randevularım: Gelen (mentor) / Giden (talep eden) sekmeleri, durum rozetleri, boş durumlar. */
export function MyAppointments({ initial, initialRole, showSettings, list }: Props) {
  const t = useTranslations('appointments.mine');
  const modes = useTranslations('appointments.modes');
  const errors = useTranslations('errors.codes');
  const [role, setRole] = useState<Role>(initialRole);
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [error, setError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const locked = useRef(false);

  async function load(next: Role, after?: string) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await list({ role: next, ...(after ? { cursor: after } : {}) });
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setRole(next);
      setItems((current) => (after ? [...current, ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  const body = (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      {error && (
        <p role="alert" className="text-base text-danger">
          {errors(error)}
        </p>
      )}
      {items.length === 0 && !pending ? (
        <EmptyState
          title={role === 'MENTOR' ? t('emptyIncoming') : t('emptyOutgoing')}
          description={
            role === 'MENTOR' ? t('emptyIncomingDescription') : t('emptyOutgoingDescription')
          }
          action={
            role === 'MENTEE' ? (
              <Link className={buttonClasses({ size: 'lg' })} href="/mentorlar">
                {t('findMentor')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id} className="rounded-card border border-border bg-bg p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <AppointmentStatusBadge status={item.status} />
                <span className="text-base text-fg-muted">{modes(item.mode)}</span>
              </div>
              <h2 className="mt-3 break-words text-lg font-semibold text-fg">
                {item.counterpart.displayName}
              </h2>
              <p className="mt-1 text-base text-fg">{fullLabel(item.startsAt)}</p>
              <p className="text-base text-fg-muted">{rangeLabel(item.startsAt, item.endsAt)}</p>
              {item.status === 'REQUESTED' && item.expiresAt && (
                <p className="mt-1 text-base text-fg-muted">
                  {t('expires', { date: fullLabel(item.expiresAt) })}
                </p>
              )}
              <Link
                className={
                  buttonClasses({ variant: item.actions.canConfirm ? 'primary' : 'secondary' }) +
                  ' mt-4'
                }
                href={`/randevular/${item.id}`}
              >
                {t('open')}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <Button variant="secondary" loading={pending} onClick={() => void load(role, cursor)}>
          {t('more')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="[&_.text-sm]:text-base mx-auto w-full max-w-lg px-5 pb-10 pt-10 sm:pt-16">
      <p className="text-base font-semibold text-primary">{t('eyebrow')}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">{t('title')}</h1>
      <p className="mt-3 text-base text-fg-muted">{t('description')}</p>
      {showSettings && (
        <Link className={buttonClasses({ variant: 'secondary' }) + ' mt-4'} href="/mentor/ayarlar">
          {t('settings')}
        </Link>
      )}
      <Tabs
        className="mt-6"
        label={t('tabs.label')}
        value={role}
        onValueChange={(id) => {
          void load(id as Role);
        }}
        items={(['MENTOR', 'MENTEE'] as const).map((id) => ({
          id,
          label: t(`tabs.${id}`),
          content: body,
        }))}
      />
    </div>
  );
}

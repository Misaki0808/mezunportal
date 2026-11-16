'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRef, useState } from 'react';

import type { AppointmentPage, ListMyAppointmentsInput } from '@/contracts/appointment';
import type { ActionResult } from '@/contracts/result';
import {
  Avatar,
  Button,
  CalendarIcon,
  EmptyState,
  PageHeader,
  Tabs,
  buttonClasses,
} from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import { AppointmentStatusBadge } from './status-badge';
import { dateBlock, fullLabel, rangeLabel } from './time';

type Role = 'MENTOR' | 'MENTEE';
type Props = {
  initial: AppointmentPage;
  initialRole: Role;
  /** Mentor ayarları bağlantısı yalnız mentor olabilen kullanıcıya gösterilir. */
  showSettings: boolean;
  /** Dizinde bu kullanıcının görebildiği hiç mentor yoksa `false`: boş "Giden" durumu "Mentor bul" yerine deneyimlere yönlendirir. */
  mentorsAvailable?: boolean;
  list: (input: ListMyAppointmentsInput) => Promise<ActionResult<AppointmentPage>>;
};

/** Randevularım: Gelen (mentor) / Giden (talep eden) sekmeleri, durum rozetleri, boş durumlar. */
export function MyAppointments({
  initial,
  initialRole,
  showSettings,
  mentorsAvailable = true,
  list,
}: Props) {
  const t = useTranslations('appointments.mine');
  const modes = useTranslations('appointments.modes');
  const errors = useTranslations('errors.codes');
  const [role, setRole] = useState<Role>(initialRole);
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [error, setError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  // Yaklaşan/geçmiş ayrımı için bir kez alınan an (her çizimde değişmez, sunucu ve istemci arasında oynamaz).
  const [now] = useState(() => Date.now());

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

  const isUpcoming = (item: AppointmentPage['items'][number]) =>
    (item.status === 'REQUESTED' || item.status === 'CONFIRMED') &&
    new Date(item.endsAt).getTime() >= now;
  const upcoming = items.filter(isUpcoming);
  const past = items.filter((item) => !isUpcoming(item));

  const body = (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      {error && (
        <p role="alert" className="text-base text-danger">
          {errors(error)}
        </p>
      )}
      {items.length === 0 && !pending ? (
        <EmptyState
          icon={<CalendarIcon width={32} height={32} strokeWidth={1.5} />}
          title={
            role === 'MENTOR'
              ? t('emptyIncoming')
              : t(mentorsAvailable ? 'emptyOutgoing' : 'emptyOutgoingNoMentor')
          }
          description={
            role === 'MENTOR'
              ? t('emptyIncomingDescription')
              : t(
                  mentorsAvailable
                    ? 'emptyOutgoingDescription'
                    : 'emptyOutgoingNoMentorDescription',
                )
          }
          action={
            role === 'MENTEE' ? (
              <Link
                className={buttonClasses({ size: 'lg' })}
                href={mentorsAvailable ? '/mentorlar' : '/deneyimler'}
              >
                {t(mentorsAvailable ? 'findMentor' : 'browseExperiences')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {(
            [
              ['upcoming', upcoming],
              ['past', past],
            ] as const
          ).map(
            ([key, list]) =>
              list.length > 0 && (
                <section key={key} aria-labelledby={`appointments-${key}`}>
                  <h2
                    id={`appointments-${key}`}
                    className="px-1 pb-2 text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase"
                  >
                    {t(key)}
                  </h2>
                  <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-card">
                    {list.map((item) => {
                      const block = dateBlock(item.startsAt);
                      return (
                        <li
                          key={item.id}
                          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-4">
                            <div
                              aria-hidden="true"
                              className="flex w-14 shrink-0 flex-col items-center rounded-control bg-primary-soft py-2 text-on-primary-soft"
                            >
                              <span className="text-xs font-semibold tracking-wide">
                                {block.month}
                              </span>
                              <span className="text-2xl leading-none font-extrabold">
                                {block.day}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Avatar
                                  src={item.counterpart.photoSrc}
                                  name={item.counterpart.displayName}
                                  size="sm"
                                  decorative
                                />
                                <h3 className="min-w-0 break-words text-lg font-semibold text-fg">
                                  {item.counterpart.displayName}
                                </h3>
                              </div>
                              <p className="mt-0.5 text-base text-fg">{fullLabel(item.startsAt)}</p>
                              <p className="text-base text-fg-muted">
                                <span>{rangeLabel(item.startsAt, item.endsAt)}</span> ·{' '}
                                <span>{modes(item.mode)}</span>
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <AppointmentStatusBadge status={item.status} />
                              </div>
                              {item.status === 'REQUESTED' && item.expiresAt && (
                                <p className="mt-1 text-base text-fg-muted">
                                  {t('expires', { date: fullLabel(item.expiresAt) })}
                                </p>
                              )}
                            </div>
                          </div>
                          <Link
                            className={
                              buttonClasses({
                                variant: item.actions.canConfirm ? 'primary' : 'secondary',
                              }) + ' w-full sm:w-auto sm:shrink-0'
                            }
                            href={`/randevular/${item.id}`}
                          >
                            {t('open')}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ),
          )}
        </div>
      )}
      {cursor && (
        <Button variant="secondary" loading={pending} onClick={() => void load(role, cursor)}>
          {t('more')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="[&_.text-sm]:text-base w-full max-w-4xl">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          showSettings && (
            <Link className={buttonClasses({ variant: 'secondary' })} href="/mentor/ayarlar">
              {t('settings')}
            </Link>
          )
        }
      />
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

'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import {
  BellIcon,
  BriefcaseIcon,
  Button,
  CalendarIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  EmptyState,
  FileTextIcon,
  IconChip,
  InfoIcon,
  MailIcon,
  PageHeader,
  UsersIcon,
  buttonClasses,
  cn,
  useAction,
  type IconChipTone,
} from '@/components/ui';
import type { InboxGroupView, InboxPage } from '@/contracts/inbox';
import { getMyInbox, markAllInboxRead, markInboxRead } from '@/server/actions/inbox';

import { INBOX_CHANGED_EVENT } from './notification-bell';

const CATEGORY: Record<InboxGroupView['category'], { icon: ReactNode; tone: IconChipTone }> = {
  job: { icon: <BriefcaseIcon />, tone: 'primary' },
  appointment: { icon: <CalendarIcon />, tone: 'accent' },
  experience: { icon: <FileTextIcon />, tone: 'success' },
  contact: { icon: <MailIcon />, tone: 'accent' },
  faq: { icon: <InfoIcon />, tone: 'primary' },
  cv: { icon: <ClipboardCheckIcon />, tone: 'success' },
  referral: { icon: <UsersIcon />, tone: 'primary' },
  calendar: { icon: <CalendarIcon />, tone: 'primary' },
};

const ISTANBUL = 'Europe/Istanbul';
const timeFormat = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ISTANBUL,
});
const previousDay = (day: string) =>
  new Date(new Date(`${day}T12:00:00+03:00`).getTime() - 86_400_000).toLocaleDateString('en-CA', {
    timeZone: ISTANBUL,
  });

function dayLabel(day: string, today: string, labels: { today: string; yesterday: string }) {
  if (day === today) return labels.today;
  if (day === previousDay(today)) return labels.yesterday;
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: ISTANBUL,
  }).format(new Date(`${day}T12:00:00+03:00`));
}

/**
 * Bildirim kutusu: aynı tür + aynı gün tek satır ("Profiline uyan 3 yeni ilan var."), günlere göre başlıklı. Satır tek dokunuşla ilgili
 * sayfaya gider ve okundu olur (gezinmeyi bekletmeden). Okunmamış satır kalın + nokta + ekran okuyucu metniyle ayrılır (renk tek sinyal değil).
 */
export function InboxList({ initial, today }: { initial: InboxPage; today: string }) {
  const t = useTranslations('inbox');
  const action = useAction();
  const [groups, setGroups] = useState(initial.groups);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [unread, setUnread] = useState(initial.unread);

  const announce = () => window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
  function open(group: InboxGroupView) {
    if (!group.unread) return;
    setGroups((current) =>
      current.map((item) => (item.key === group.key ? { ...item, unread: 0 } : item)),
    );
    setUnread((current) => Math.max(0, current - group.unread));
    // Gezinmeyi beklemez; başarısızsa kayıt okunmamış kalır, zarar yoktur.
    void markInboxRead({ ids: group.ids })
      .then(announce)
      .catch(() => undefined);
  }
  const markAll = () =>
    void action.run(() => markAllInboxRead(), {
      success: t('markAllDone'),
      onOk: () => {
        setGroups((current) => current.map((item) => ({ ...item, unread: 0 })));
        setUnread(0);
        announce();
      },
    });
  const loadMore = () =>
    void action.run(() => getMyInbox({ cursor: cursor ?? undefined }), {
      onOk: (page) => {
        setGroups((current) => [...current, ...page.groups]);
        setCursor(page.nextCursor);
        setUnread(page.unread);
      },
    });

  const labels = { today: t('today'), yesterday: t('yesterday') };
  const days = [...new Set(groups.map((group) => group.day))];
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-8 sm:py-10">
      <PageHeader title={t('title')} description={t('description')}>
        {groups.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Button
              variant="secondary"
              loading={action.busy}
              onClick={markAll}
              {...(unread === 0
                ? ({ disabled: true, disabledReason: t('markAllNone') } as const)
                : { disabled: false as const })}
            >
              {t('markAll')}
            </Button>
            <Link
              href="/hesap/bildirimler"
              className="press-control inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t('preferencesLink')}
            </Link>
          </div>
        )}
      </PageHeader>

      {action.error && (
        <p role="alert" className="text-danger">
          {action.error}
        </p>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={<BellIcon width={32} height={32} strokeWidth={1.5} />}
          title={t('empty.title')}
          description={t('empty.description')}
          action={
            <Link href="/ilanlar" className={buttonClasses({ variant: 'secondary' })}>
              {t('empty.action')}
            </Link>
          }
        />
      ) : (
        days.map((day) => {
          const label = dayLabel(day, today, labels);
          return (
            <section key={day} aria-label={label} className="space-y-2">
              <h2 className="text-sm font-semibold tracking-wide text-fg-muted">{label}</h2>
              <ul className="space-y-2">
                {groups
                  .filter((group) => group.day === day)
                  .map((group) => {
                    const { icon, tone } = CATEGORY[group.category];
                    const unreadGroup = group.unread > 0;
                    return (
                      <li key={group.key}>
                        <Link
                          href={group.href}
                          onClick={() => open(group)}
                          className="press-row flex min-h-16 items-center gap-3 rounded-card border border-border bg-bg p-3 sm:p-4"
                        >
                          <IconChip tone={tone}>{icon}</IconChip>
                          <span
                            className={cn(
                              'min-w-0 flex-1 break-words text-base',
                              unreadGroup ? 'font-semibold text-fg' : 'text-fg-muted',
                            )}
                          >
                            {t(`kinds.${group.kind}.${group.count === 1 ? 'one' : 'many'}`, {
                              count: group.count,
                            })}
                            {/* Aynı metinli satırlar (farklı günlerde tek ilan) ekran okuyucuda gün bilgisiyle ayrışır. */}
                            <span className="sr-only">, {label}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-sm text-fg-muted">
                            <time dateTime={group.latestAt.toISOString()}>
                              {timeFormat.format(group.latestAt)}
                            </time>
                            {unreadGroup && (
                              <>
                                <span
                                  aria-hidden="true"
                                  className="size-2.5 rounded-full bg-accent"
                                />
                                <span className="sr-only">{t('unread')}</span>
                              </>
                            )}
                            <ChevronRightIcon />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </section>
          );
        })
      )}

      {cursor && (
        <Button variant="secondary" fullWidth loading={action.busy} onClick={loadMore}>
          {t('loadMore')}
        </Button>
      )}
    </div>
  );
}

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HomeSummary } from '@/contracts/home';
import {
  BriefcaseIcon,
  Card,
  CheckIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  IconChip,
  PageHeader,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
  buttonClasses,
} from '@/components/ui';
import { homeDate, homeGreeting } from './presentation';
import {
  JobsPanel,
  MentorCapacityPanel,
  MentorsPanel,
  ProfilePanel,
  UpcomingPanel,
  type HomePanels,
} from './widgets';

type ShortcutKey = 'search' | 'mentors' | 'cvReview' | 'cvInbox' | 'write' | 'profile';
const SHORTCUTS: Record<
  HomeSummary['role'],
  readonly { key: ShortcutKey; href: string; icon: ReactNode }[]
> = {
  STUDENT: [
    { key: 'search', href: '/deneyimler', icon: <BriefcaseIcon /> },
    { key: 'mentors', href: '/mentorlar', icon: <UsersIcon /> },
    { key: 'cvReview', href: '/hesap/cv-inceleme', icon: <FileTextIcon /> },
    { key: 'write', href: '/deneyim/yeni', icon: <ClipboardCheckIcon /> },
  ],
  MENTOR: [
    { key: 'search', href: '/deneyimler', icon: <BriefcaseIcon /> },
    { key: 'cvInbox', href: '/hesap/cv-inceleme', icon: <FileTextIcon /> },
    { key: 'write', href: '/deneyim/yeni', icon: <ClipboardCheckIcon /> },
    { key: 'profile', href: '/profil', icon: <UserIcon /> },
  ],
};
const PENDING_LINKS = [
  { key: 'appointmentRequests', href: '/randevular' },
  { key: 'contactRequests', href: '/hesap/iletisim' },
  { key: 'cvReviewsToAnswer', href: '/hesap/cv-inceleme' },
  { key: 'cvReviewsToRate', href: '/hesap/cv-inceleme' },
  { key: 'feedbackForms', href: '/hesap/gorusmeler' },
] as const;
const CHIP_TONES = ['primary', 'accent', 'success', 'primary'] as const;

export type HomeDashboardProps = {
  summary: HomeSummary;
  panels: HomePanels;
  feature?: ReactNode;
  notice?: ReactNode;
  now?: Date;
};

/** Sunucudaki sayıları ve hazır görünürlük kararlarını sunar; kişi başına ek istek yapmaz. */
export function HomeDashboard({
  summary,
  panels,
  feature,
  notice,
  now = new Date(),
}: HomeDashboardProps) {
  const t = useTranslations('home');
  const a = useTranslations('home.dashboard');
  const pending = PENDING_LINKS.map((item) => ({
    ...item,
    count: summary.pending[item.key],
  })).filter((item) => item.count > 0);
  const total = pending.reduce((sum, item) => sum + item.count, 0);
  const student = summary.role === 'STUDENT';
  const canMentor = panels.settings?.ok && panels.settings.data.eligible;
  const incomplete = panels.completion !== null && panels.completion.percent < 100;
  const next = panels.appointments?.ok
    ? panels.appointments.data.items.find(
        (item) => item.status === 'CONFIRMED' && item.startsAt >= now,
      )
    : undefined;
  const description = next
    ? a('overview.next', {
        date: homeDate(next.startsAt, { weekday: 'long', hour: '2-digit', minute: '2-digit' }),
      })
    : total > 0
      ? t('pendingCount', { count: total })
      : t(`subtitle.${summary.role}`);
  const greeting = a(`greetings.${homeGreeting(now)}`);
  const stats = [
    {
      label: a('stats.profile'),
      value: panels.completion ? `%${panels.completion.percent}` : a('stats.unknown'),
      hint: panels.completion
        ? a('stats.steps', { count: panels.completion.missing.length })
        : a('stats.unavailable'),
    },
    {
      label: a('stats.pending'),
      value: String(total),
      hint: total ? a('stats.pendingHint') : t('pendingNone'),
    },
    {
      label: a('stats.appointment'),
      value: next
        ? homeDate(next.startsAt, { day: 'numeric', month: 'short' })
        : panels.appointments?.ok
          ? a('stats.none')
          : a('stats.unknown'),
      hint: next
        ? homeDate(next.startsAt, { hour: '2-digit', minute: '2-digit' })
        : panels.appointments?.ok
          ? a('stats.noAppointment')
          : a('stats.unavailable'),
    },
  ];
  return (
    <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
        <PageHeader
          className="min-w-0 max-w-none flex-1"
          eyebrow={
            <time dateTime={now.toISOString()}>
              {homeDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}
            </time>
          }
          title={
            summary.firstName ? a('greetingNamed', { greeting, name: summary.firstName }) : greeting
          }
          description={description}
        />
        <nav
          aria-label={a('actions.label')}
          className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
        >
          {student ? (
            <>
              {incomplete && (
                <Link
                  className={buttonClasses({ variant: 'secondary' }) + ' hidden sm:inline-flex'}
                  href="/mentorlar"
                >
                  {a('actions.mentors')}
                </Link>
              )}
              <Link
                className={buttonClasses({ size: 'lg' }) + ' w-full sm:w-auto'}
                href={incomplete ? '/profil/cv' : '/mentorlar'}
              >
                {incomplete ? a('actions.cv') : a('actions.mentors')}
              </Link>
            </>
          ) : (
            <Link
              className={buttonClasses({ size: 'lg' }) + ' w-full sm:w-auto'}
              href={
                summary.pending.appointmentRequests > 0
                  ? '/randevular'
                  : canMentor
                    ? '/mentor/ayarlar'
                    : summary.adminPending !== null
                      ? '/yonetim'
                      : '/profil'
              }
            >
              {a(
                summary.pending.appointmentRequests > 0
                  ? 'actions.requests'
                  : canMentor
                    ? 'actions.mentorSettings'
                    : summary.adminPending !== null
                      ? 'actions.admin'
                      : 'actions.profile',
              )}
            </Link>
          )}
        </nav>
      </div>
      <dl aria-label={a('stats.label')} className="grid grid-cols-3 gap-2 sm:gap-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            padding="none"
            className="min-w-0 bg-surface px-3 py-3 sm:px-5 sm:py-4"
          >
            <dt className="break-words text-sm text-fg-muted sm:text-base">{stat.label}</dt>
            <dd className="mt-1 break-words font-heading text-xl font-extrabold sm:text-3xl">
              {stat.value}
            </dd>
            <dd className="mt-1 hidden text-sm text-fg-muted sm:block">{stat.hint}</dd>
          </Card>
        ))}
      </dl>
      {notice}
      {summary.adminPending !== null && (
        <Link
          href="/yonetim"
          className="press-row flex min-h-16 items-center justify-between gap-3 rounded-card border border-primary bg-primary-soft px-4 py-3 text-on-primary-soft"
        >
          <span className="flex items-center gap-3">
            <ShieldCheckIcon />
            <span>
              <span className="block text-lg font-semibold">{t('admin.title')}</span>
              <span className="block">
                {summary.adminPending > 0
                  ? t('admin.pending', { count: summary.adminPending })
                  : t('admin.none')}
              </span>
            </span>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="min-w-0 lg:col-span-7">
          <UpcomingPanel result={panels.appointments} now={now} student={!canMentor} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <ProfilePanel completion={panels.completion} />
        </div>
        {student ? (
          <>
            <div className="min-w-0 lg:col-span-7">
              <JobsPanel result={panels.jobs} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <MentorsPanel result={panels.mentors} />
            </div>
          </>
        ) : null}
        <Card
          as="section"
          aria-labelledby="home-pending"
          className="min-w-0 bg-surface lg:col-span-7"
        >
          <h2 id="home-pending" className="font-heading text-lg font-bold">
            {t('pendingTitle')}
          </h2>
          {pending.length ? (
            <ul className="mt-3 divide-y divide-border">
              {pending.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="press-row flex min-h-14 items-center justify-between gap-3 py-3 font-medium"
                  >
                    <span>{t(`pending.${item.key}`, { count: item.count })}</span>
                    <span aria-hidden="true" className="text-primary">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 flex items-start gap-2 text-fg-muted">
              <CheckIcon className="shrink-0 text-success" />
              {t('pendingNone')}
            </p>
          )}
        </Card>
        {!student && (canMentor || !panels.settings?.ok) && (
          <div className="min-w-0 lg:col-span-5">
            <MentorCapacityPanel result={panels.settings} />
          </div>
        )}
        <Card
          as="section"
          aria-labelledby="home-shortcuts"
          className={`min-w-0 bg-surface ${student ? 'lg:col-span-5' : 'lg:col-span-12'}`}
        >
          <h2 id="home-shortcuts" className="font-heading text-lg font-bold">
            {t('shortcutsTitle')}
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {SHORTCUTS[summary.role].map((item, index) => (
              <li key={item.key}>
                <Link href={item.href} className="press-row flex min-h-16 items-center gap-3 py-3">
                  <IconChip tone={CHIP_TONES[index]}>{item.icon}</IconChip>
                  <span className="min-w-0">
                    <span className="block font-semibold">{t(`shortcuts.${item.key}.title`)}</span>
                    <span className="block text-fg-muted">
                      {t(`shortcuts.${item.key}.description`)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        {feature && <div className="min-w-0 lg:col-span-12">{feature}</div>}
      </div>
    </div>
  );
}

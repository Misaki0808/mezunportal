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
  now?: Date;
};

/** Sunucudaki sayıları ve hazır görünürlük kararlarını sunar; kişi başına ek istek yapmaz. */
export function HomeDashboard({ summary, panels, feature, now = new Date() }: HomeDashboardProps) {
  const t = useTranslations('home');
  const a = useTranslations('home.dashboard');
  const pending = PENDING_LINKS.map((item) => ({
    ...item,
    count: summary.pending[item.key],
  })).filter((item) => item.count > 0);
  const total = pending.reduce((sum, item) => sum + item.count, 0);
  const student = summary.role === 'STUDENT';
  const canMentor = panels.settings?.ok && panels.settings.data.eligible;
  const showCapacity = !student && (canMentor || !panels.settings?.ok);
  const incomplete = panels.completion !== null && panels.completion.percent < 100;
  const next = panels.appointments?.ok
    ? panels.appointments.data.items.find(
        (item) => item.status === 'CONFIRMED' && item.startsAt >= now,
      )
    : undefined;
  // Sıradaki görüşmeyi özet kutusu söyler; başlık altında yinelenmez.
  const description =
    total > 0 ? t('pendingCount', { count: total }) : t(`subtitle.${summary.role}`);
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
  const pendingCard = pending.length ? (
    <Card as="section" aria-labelledby="home-pending" className="h-full min-w-0 bg-surface">
      <h2 id="home-pending" className="font-heading text-lg font-bold">
        {t('pendingTitle')}
      </h2>
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
    </Card>
  ) : null;
  const capacityCard = showCapacity ? <MentorCapacityPanel result={panels.settings} /> : null;
  // Kısayol kartı tek başına ya da iki kartla birlikte tam genişlikte olunca iki sütuna açılır.
  const shortcutsWide = Number(Boolean(pendingCard)) + Number(Boolean(capacityCard)) !== 1;
  const shortcutsCard = (
    <Card as="section" aria-labelledby="home-shortcuts" className="h-full min-w-0 bg-surface">
      <h2 id="home-shortcuts" className="font-heading text-lg font-bold">
        {t('shortcutsTitle')}
      </h2>
      <ul
        className={
          shortcutsWide
            ? 'mt-3 grid gap-x-8 lg:grid-cols-2 lg:[&>li:nth-last-child(-n+2)]:border-b-0'
            : 'mt-3'
        }
      >
        {SHORTCUTS[summary.role].map((item, index) => (
          <li key={item.key} className="border-b border-border last:border-b-0">
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
  );
  // Kalan kartlar (bekleyen iş yalnız iş varken): tek kart tam genişlik, iki kart 7/5, üç kart 7/5 + tam genişlik kısayol.
  const rest: { key: string; node: ReactNode }[] = [];
  if (pendingCard) rest.push({ key: 'pending', node: pendingCard });
  if (capacityCard) rest.push({ key: 'capacity', node: capacityCard });
  const lowerRow: { key: string; span: string; node: ReactNode }[] =
    rest.length === 0
      ? [{ key: 'shortcuts', span: 'lg:col-span-12', node: shortcutsCard }]
      : rest.length === 1
        ? student
          ? [
              { ...rest[0]!, span: 'lg:col-span-7' },
              { key: 'shortcuts', span: 'lg:col-span-5', node: shortcutsCard },
            ]
          : [
              { key: 'shortcuts', span: 'lg:col-span-7', node: shortcutsCard },
              { ...rest[0]!, span: 'lg:col-span-5' },
            ]
        : [
            { ...rest[0]!, span: 'lg:col-span-7' },
            { ...rest[1]!, span: 'lg:col-span-5' },
            { key: 'shortcuts', span: 'lg:col-span-12', node: shortcutsCard },
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
                  className={buttonClasses({ variant: 'secondary' }) + ' max-sm:hidden'}
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
      <dl
        aria-label={a('stats.label')}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,5rem),1fr))] gap-2 sm:gap-4"
      >
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
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="min-w-0 lg:col-span-7">
          <UpcomingPanel result={panels.appointments} now={now} student={!canMentor} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <ProfilePanel
            completion={panels.completion}
            continueOnboarding={panels.continueOnboarding}
          />
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
        {student && feature && <div className="min-w-0 lg:col-span-12">{feature}</div>}
        {lowerRow.map((cell) => (
          <div key={cell.key} className={`min-w-0 ${cell.span}`}>
            {cell.node}
          </div>
        ))}
        {!student && feature && <div className="min-w-0 lg:col-span-12">{feature}</div>}
      </div>
    </div>
  );
}

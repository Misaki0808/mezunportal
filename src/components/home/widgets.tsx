import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AppointmentPage, MentorSettingsView } from '@/contracts/appointment';
import { appointmentIcsHref } from '@/contracts/appointment';
import type { ProfileCompletion } from '@/contracts/profile';
import type { SimilarMentors } from '@/contracts/mentor-directory';
import type { PublishedStory } from '@/contracts/alumni-story';
import type { ActionResult } from '@/contracts/result';
import type { getSuggestedJobs } from '@/server/actions/home';
import {
  Avatar,
  Badge,
  BriefcaseIcon,
  CalendarIcon,
  Card,
  CheckIcon,
  EmptyState,
  ErrorState,
  IconChip,
  UsersIcon,
  buttonClasses,
} from '@/components/ui';
import { homeDate } from './presentation';

const COMPACT_EMPTY =
  'grid! grid-cols-[auto_1fr] items-start! gap-x-3 p-0! text-left! [&>span]:row-span-3 [&>span]:size-11';

export type JobsResult = Awaited<ReturnType<typeof getSuggestedJobs>>;
export type HomePanels = {
  completion: ProfileCompletion | null;
  appointments: ActionResult<AppointmentPage> | null;
  mentors?: ActionResult<SimilarMentors> | null;
  jobs?: JobsResult | null;
  settings?: ActionResult<MentorSettingsView> | null;
};

function Panel({
  id,
  title,
  href,
  action,
  children,
}: {
  id: string;
  title: string;
  href: string;
  action: string;
  children: ReactNode;
}) {
  return (
    <Card as="section" aria-labelledby={id} className="min-w-0 bg-surface">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="font-heading text-lg font-bold">
          {title}
        </h2>
        <Link
          href={href}
          className="press-control inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
        >
          {action}
        </Link>
      </header>
      {children}
    </Card>
  );
}

export function UpcomingPanel({
  result,
  now,
  student,
}: {
  result: HomePanels['appointments'];
  now: Date;
  student: boolean;
}) {
  const t = useTranslations('home.dashboard');
  const items = result?.ok
    ? result.data.items
        .filter((item) => item.status === 'CONFIRMED' && item.startsAt >= now)
        .slice(0, 2)
    : [];
  const next = items[0];
  return (
    <Panel
      id="home-appointments"
      title={t('appointments.title')}
      href="/randevular"
      action={t('appointments.all')}
    >
      {!result?.ok ? (
        <ErrorState errorCode={result && !result.ok ? result.errorCode : 'SERVER_UNEXPECTED'} />
      ) : !next ? (
        <EmptyState
          className={COMPACT_EMPTY}
          icon={<CalendarIcon />}
          title={t('appointments.empty')}
          description={t(student ? 'appointments.emptyStudent' : 'appointments.emptyMentor')}
          action={
            <Link
              className={buttonClasses({ variant: 'secondary' })}
              href={student ? '/mentorlar' : '/mentor/ayarlar'}
            >
              {t(student ? 'actions.mentors' : 'actions.mentorSettings')}
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className="flex w-16 shrink-0 flex-col items-center rounded-control bg-primary-soft px-2 py-3 text-on-primary-soft"
            >
              <span className="text-sm font-semibold uppercase">
                {homeDate(next.startsAt, { month: 'short' })}
              </span>
              <span className="font-heading text-3xl font-extrabold">
                {homeDate(next.startsAt, { day: 'numeric' })}
              </span>
              <span className="text-sm">{homeDate(next.startsAt, { weekday: 'short' })}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-lg font-semibold">
                {t('appointments.with', { name: next.counterpart.displayName })}
              </h3>
              <p className="mt-1 text-fg-muted">
                <time dateTime={next.startsAt.toISOString()}>
                  {homeDate(next.startsAt, { dateStyle: 'long' })} ·{' '}
                  {homeDate(next.startsAt, { timeStyle: 'short' })}–
                  {homeDate(next.endsAt, { timeStyle: 'short' })}
                </time>
              </p>
              <p className="mt-1 text-fg-muted">{t(`appointments.mode.${next.mode}`)}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              className={buttonClasses({ variant: 'secondary' })}
              href={`/randevular/${next.id}`}
            >
              {t('appointments.details')}
            </Link>
            {next.actions.canDownloadIcs && (
              <a href={appointmentIcsHref(next.id)} className={buttonClasses({ variant: 'ghost' })}>
                {t('appointments.calendar')}
              </a>
            )}
          </div>
          {items[1] && (
            <p className="mt-4 border-t border-border pt-4 text-fg-muted">
              {t('appointments.then', {
                name: items[1].counterpart.displayName,
                date: homeDate(items[1].startsAt, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

export function ProfilePanel({ completion }: { completion: ProfileCompletion | null }) {
  const t = useTranslations('home.dashboard');
  return (
    <Panel id="home-profile" title={t('profile.title')} href="/profil" action={t('profile.edit')}>
      {!completion ? (
        <ErrorState errorCode="SERVER_UNEXPECTED" />
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <strong className="font-heading text-3xl font-extrabold">%{completion.percent}</strong>
            <span className="text-fg-muted">{t('profile.complete')}</span>
          </p>
          <div
            role="progressbar"
            aria-label={t('profile.progress')}
            aria-valuenow={completion.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-strong"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          <p className="mt-4 text-fg-muted">{t('profile.hint')}</p>
          {completion.missing.length ? (
            <ul className="mt-3 space-y-2">
              {completion.missing.map((step) => (
                <li key={step}>
                  <Link
                    href="/baslangic"
                    className="press-row flex min-h-11 items-center gap-2 font-medium"
                  >
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full border-2 border-border-control"
                    />
                    {t(`profile.steps.${step}`)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 flex items-center gap-2">
              <CheckIcon className="text-success" />
              {t('profile.ready')}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

export function JobsPanel({ result }: { result: HomePanels['jobs'] }) {
  const t = useTranslations('home.dashboard');
  const old = useTranslations('home.jobMatches');
  return (
    <Panel id="home-jobs" title={t('jobs.title')} href="/ilanlar" action={t('jobs.all')}>
      {!result?.ok ? (
        <ErrorState errorCode={result && !result.ok ? result.errorCode : 'SERVER_UNEXPECTED'} />
      ) : result.data.length ? (
        <ul className="divide-y divide-border">
          {result.data.map((job) => (
            <li key={job.id}>
              <Link
                href={`/ilanlar/${job.id}`}
                className="press-row flex min-h-20 items-center gap-3 py-3"
              >
                <IconChip tone="accent">
                  <BriefcaseIcon />
                </IconChip>
                <span className="min-w-0">
                  <span className="block break-words font-semibold">{job.title}</span>
                  <span className="block break-words text-fg-muted">{job.organizationName}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className={COMPACT_EMPTY}
          icon={<BriefcaseIcon />}
          title={t('jobs.emptyTitle')}
          description={old('empty')}
          action={
            <Link className={buttonClasses({ variant: 'secondary' })} href="/profil">
              {old('profile')}
            </Link>
          }
        />
      )}
    </Panel>
  );
}

export function MentorsPanel({ result }: { result: HomePanels['mentors'] }) {
  const t = useTranslations('home.dashboard');
  return (
    <Panel id="home-mentors" title={t('mentors.title')} href="/mentorlar" action={t('mentors.all')}>
      {!result?.ok ? (
        <ErrorState errorCode={result && !result.ok ? result.errorCode : 'SERVER_UNEXPECTED'} />
      ) : result.data.items.length ? (
        <ul className="divide-y divide-border">
          {result.data.items.slice(0, 3).map(({ mentor }) => (
            <li key={mentor.userId}>
              <Link
                href={`/uye/${mentor.userId}`}
                className="press-row flex min-h-20 items-center gap-3 py-3"
              >
                <Avatar name={mentor.displayName} decorative />
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold">{mentor.displayName}</span>
                  <span className="block break-words text-fg-muted">
                    {mentor.position?.company ?? mentor.departmentName}
                  </span>
                </span>
                {mentor.availability.available && (
                  <Badge tone="success">{t('mentors.available')}</Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className={COMPACT_EMPTY}
          icon={<UsersIcon />}
          title={t('mentors.empty')}
          description={t('mentors.emptyDescription')}
          action={
            <Link className={buttonClasses({ variant: 'secondary' })} href="/mentorlar">
              {t('actions.mentors')}
            </Link>
          }
        />
      )}
    </Panel>
  );
}

export function MentorCapacityPanel({ result }: { result: HomePanels['settings'] }) {
  const t = useTranslations('home.dashboard');
  return (
    <Panel
      id="home-capacity"
      title={t('capacity.title')}
      href="/mentor/ayarlar"
      action={t('capacity.settings')}
    >
      {!result?.ok ? (
        <ErrorState errorCode={result && !result.ok ? result.errorCode : 'SERVER_UNEXPECTED'} />
      ) : result.data.settings ? (
        <>
          <p className="font-heading text-3xl font-extrabold">
            {result.data.settings.monthlyCapacity}
          </p>
          <p className="mt-2 text-fg-muted">{t('capacity.description')}</p>
          <p className="mt-4">
            <Badge tone={result.data.settings.isActive ? 'success' : 'neutral'}>
              {t(result.data.settings.isActive ? 'capacity.active' : 'capacity.inactive')}
            </Badge>
          </p>
        </>
      ) : (
        <EmptyState
          className={COMPACT_EMPTY}
          title={t('capacity.empty')}
          description={t('capacity.emptyDescription')}
          action={
            <Link className={buttonClasses({ variant: 'secondary' })} href="/mentor/ayarlar">
              {t('capacity.settings')}
            </Link>
          }
        />
      )}
    </Panel>
  );
}

export function HomeStoryBand({ story }: { story: PublishedStory }) {
  const t = useTranslations('home.dashboard');
  return (
    <Card
      as="section"
      aria-label={t('story.title')}
      className="grid grid-cols-[auto_1fr] items-start gap-4 bg-surface sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-6"
    >
      <Avatar
        name={story.name}
        decorative
        size="lg"
        className="bg-accent-soft text-on-accent-soft"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">{t('story.title')}</p>
        <blockquote className="mt-2 break-words font-heading text-lg font-semibold">
          {story.body.length > 190 ? `${story.body.slice(0, 190).trimEnd()}…` : story.body}
        </blockquote>
        <p className="mt-2 text-fg-muted">
          {story.name} · {story.department}
        </p>
      </div>
      <Link
        href={`/hikayeler/${encodeURIComponent(story.id)}`}
        className={buttonClasses({ variant: 'secondary' }) + ' col-span-2 sm:col-span-1'}
      >
        {t('story.read')}
      </Link>
    </Card>
  );
}

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getMyJobMatchNotifications } from '@/server/actions/home';
import { ErrorState } from '@/components/ui';
import { NotificationPreferencesForm } from '@/components/notifications/preferences-form';
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} from '@/server/actions/notifications';
export const dynamic = 'force-dynamic';
export default async function NotificationPreferencesPage() {
  const result = await getMyNotificationPreferences();
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const matches = await getMyJobMatchNotifications();
  const t = await getTranslations('notifications.jobMatches');
  const inbox = await getTranslations('notifications');
  const digest = await getTranslations('monthlyDigest');
  const days = matches.ok ? [...new Set(matches.data.map((row) => row.day))] : [];
  return (
    <>
      <NotificationPreferencesForm initial={result.data} save={updateMyNotificationPreferences} />
      <div className="mx-auto max-w-2xl space-y-3 px-5 pt-6">
        <Link
          className="press-row flex min-h-14 items-center rounded-card border border-border p-4 font-semibold"
          href="/bildirimler"
        >
          {inbox('inboxLink')} →
        </Link>
        <p className="text-sm text-fg-muted">{inbox('inboxNote')}</p>
        <Link
          className="press-row flex min-h-14 items-center rounded-card border border-border p-4 font-semibold"
          href="/hesap/aylik-ozet"
        >
          {digest('pageTitle')} →
        </Link>
      </div>
      {matches.ok && (
        <section aria-labelledby="job-match-notifications" className="mx-auto max-w-2xl px-5 pt-8">
          <h2 id="job-match-notifications" className="text-xl font-semibold">
            {t('title')}
          </h2>
          {!matches.data.length && <p className="mt-3 text-fg-muted">{t('empty')}</p>}
          {days.map((day) => (
            <div key={day} className="mt-4">
              <h3 className="font-medium text-fg-muted">{day}</h3>
              <ul className="mt-2 space-y-2">
                {matches.data
                  .filter((row) => row.day === day)
                  .map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/ilanlar/${row.id}`}
                        className="press-row flex min-h-14 flex-col rounded-card border border-border p-4"
                      >
                        <span className="font-semibold">{row.title}</span>
                        <span className="text-fg-muted">{row.organizationName}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

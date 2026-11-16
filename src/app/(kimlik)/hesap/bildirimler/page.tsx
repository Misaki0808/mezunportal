import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronRightIcon, ErrorState } from '@/components/ui';
import { NotificationPreferencesForm } from '@/components/notifications/preferences-form';
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} from '@/server/actions/notifications';
export const dynamic = 'force-dynamic';
export default async function NotificationPreferencesPage() {
  const result = await getMyNotificationPreferences();
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  const inbox = await getTranslations('notifications');
  const digest = await getTranslations('monthlyDigest');
  return (
    <>
      <NotificationPreferencesForm initial={result.data} save={updateMyNotificationPreferences} />
      <div className="mt-2 w-full max-w-2xl space-y-3">
        {/* Uygulama içi bildirimler TEK yerdedir (/bildirimler); bu ekran yalnız e-posta tercihleridir. */}
        <div className="space-y-2">
          <Link
            className="press-row flex min-h-14 items-center justify-between rounded-card border border-border bg-surface p-4 font-semibold shadow-card hover:bg-surface-strong"
            href="/bildirimler"
          >
            {inbox('inboxLink')}
            <ChevronRightIcon aria-hidden="true" className="text-fg-subtle" />
          </Link>
          <p className="text-sm text-fg-muted">{inbox('inboxNote')}</p>
        </div>
        <Link
          className="press-row flex min-h-14 items-center justify-between rounded-card border border-border bg-surface p-4 font-semibold shadow-card hover:bg-surface-strong"
          href="/hesap/aylik-ozet"
        >
          {digest('pageTitle')}
          <ChevronRightIcon aria-hidden="true" className="text-fg-subtle" />
        </Link>
      </div>
    </>
  );
}

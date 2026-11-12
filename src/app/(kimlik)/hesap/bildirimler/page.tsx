import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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
  const inbox = await getTranslations('notifications');
  const digest = await getTranslations('monthlyDigest');
  return (
    <>
      <NotificationPreferencesForm initial={result.data} save={updateMyNotificationPreferences} />
      <div className="mx-auto max-w-2xl space-y-4 px-5 pt-6">
        {/* Uygulama içi bildirimler TEK yerdedir (/bildirimler); bu ekran yalnız e-posta tercihleridir. */}
        <div className="space-y-2">
          <Link
            className="press-row flex min-h-14 items-center rounded-card border border-border p-4 font-semibold"
            href="/bildirimler"
          >
            {inbox('inboxLink')} →
          </Link>
          <p className="text-sm text-fg-muted">{inbox('inboxNote')}</p>
        </div>
        <Link
          className="press-row flex min-h-14 items-center rounded-card border border-border p-4 font-semibold"
          href="/hesap/aylik-ozet"
        >
          {digest('pageTitle')} →
        </Link>
      </div>
    </>
  );
}

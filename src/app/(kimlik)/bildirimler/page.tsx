import { ErrorState } from '@/components/ui';
import { InboxList } from '@/components/inbox/inbox-list';
import { istanbulDay } from '@/server/rules/jobPosting';
import { getMyInbox } from '@/server/actions/inbox';

export const dynamic = 'force-dynamic';

/** Uygulama içi bildirim kutusu: yalnız oturum sahibinin bildirimleri (yetki `getMyInbox`'ta, kimlik oturumdan). */
export default async function InboxPage() {
  const result = await getMyInbox();
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return <InboxList initial={result.data} today={istanbulDay(new Date())} />;
}

import { DigestUnsubscribe } from '@/components/notifications/digest-unsubscribe';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default function DigestUnsubscribePage() {
  return <DigestUnsubscribe />;
}

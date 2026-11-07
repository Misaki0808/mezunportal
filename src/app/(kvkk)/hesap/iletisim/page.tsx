import { getTranslations } from 'next-intl/server';
import { listContactRequests } from '@/server/actions/contact-request';
import { ErrorState } from '@/components/ui';
import { PrivacyFrame } from '@/components/privacy/frame';
import { ContactList } from '@/components/privacy/contact-list';
export const dynamic = 'force-dynamic';
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ box?: string }>;
}) {
  const box = (await searchParams).box === 'OUTGOING' ? 'OUTGOING' : 'INCOMING';
  const [result, t] = await Promise.all([
    listContactRequests({ box }),
    getTranslations('privacyScreens.contacts'),
  ]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <PrivacyFrame title={t('title')} description={t('description')}>
      <ContactList initial={result.data} initialBox={box} />
    </PrivacyFrame>
  );
}

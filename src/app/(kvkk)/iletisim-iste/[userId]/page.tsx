import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { PrivacyFrame } from '@/components/privacy/frame';
import { ContactSendForm } from '@/components/privacy/contact-send-form';
import { previewContactTarget } from '@/server/actions/contact-request';
import { EmptyState, ErrorState, buttonClasses } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function ContactSendPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const t = await getTranslations('privacyScreens.contacts');
  const preview = await previewContactTarget({ targetUserId: userId });
  if (!preview.ok) return <ErrorState errorCode={preview.errorCode} />;
  if (!preview.data.canRequest)
    return (
      <PrivacyGuard>
        <PrivacyFrame title={t('sendTitle')} description={t('sendDescription')}>
          <EmptyState
            title={t('targetUnavailable')}
            description={t('targetUnavailableDescription')}
            action={
              <Link href="/hesap/iletisim" className={buttonClasses({ variant: 'secondary' })}>
                {t('targetBack')}
              </Link>
            }
          />
        </PrivacyFrame>
      </PrivacyGuard>
    );
  return (
    <PrivacyGuard>
      <PrivacyFrame
        title={t('sendTitleTo', { name: preview.data.displayName })}
        description={t('sendDescription')}
      >
        <ContactSendForm targetUserId={userId} requestableFields={preview.data.requestableFields} />
      </PrivacyFrame>
    </PrivacyGuard>
  );
}

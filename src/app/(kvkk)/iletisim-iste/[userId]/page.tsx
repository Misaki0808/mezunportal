import { getTranslations } from 'next-intl/server';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { PrivacyFrame } from '@/components/privacy/frame';
import { ContactSendForm } from '@/components/privacy/contact-send-form';
export const dynamic = 'force-dynamic';
export default async function ContactSendPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const t = await getTranslations('privacyScreens.contacts');
  return (
    <PrivacyGuard>
      <PrivacyFrame title={t('sendTitle')} description={t('sendDescription')}>
        <ContactSendForm targetUserId={userId} />
      </PrivacyFrame>
    </PrivacyGuard>
  );
}

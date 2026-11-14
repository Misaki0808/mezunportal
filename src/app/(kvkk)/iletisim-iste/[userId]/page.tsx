import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { PrivacyFrame } from '@/components/privacy/frame';
import { ContactSendForm } from '@/components/privacy/contact-send-form';
import { previewContactTarget } from '@/server/actions/contact-request';
import { EmptyState, ErrorState } from '@/components/ui';
import { RETURN_PATH_PARAM, safeReturnPath } from '@/lib/return-path';
export const dynamic = 'force-dynamic';
export default async function ContactSendPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await params;
  // Geri bağlantısı kaynağa döner (mentor dizini/profili); yalnız güvenli site içi yol kabul edilir.
  const returnTo = safeReturnPath((await searchParams)[RETURN_PATH_PARAM]);
  return (
    <PrivacyGuard>
      <ContactTarget userId={userId} returnTo={returnTo} />
    </PrivacyGuard>
  );
}
async function ContactTarget({ userId, returnTo }: { userId: string; returnTo: string | null }) {
  const back = returnTo ? { href: returnTo } : undefined;
  const t = await getTranslations('privacyScreens.contacts');
  const preview = await previewContactTarget({ targetUserId: userId });
  if (!preview.ok) return <ErrorState errorCode={preview.errorCode} />;
  if (!preview.data.canRequest)
    return (
      <PrivacyFrame title={t('sendTitle')} description={t('sendDescription')} back={back}>
        <EmptyState
          title={t('targetUnavailable')}
          description={t('targetUnavailableDescription')}
          action={
            <Link
              href="/hesap/iletisim"
              className="press-control inline-flex min-h-11 items-center justify-center rounded-control border border-border px-4 font-medium text-fg"
            >
              {t('targetBack')}
            </Link>
          }
        />
      </PrivacyFrame>
    );
  return (
    <PrivacyFrame
      title={t('sendTitleTo', { name: preview.data.displayName })}
      description={t('sendDescription')}
      back={back}
    >
      <ContactSendForm
        targetUserId={userId}
        requestableFields={preview.data.requestableFields}
        pendingRequest={preview.data.pendingRequest}
      />
    </PrivacyFrame>
  );
}

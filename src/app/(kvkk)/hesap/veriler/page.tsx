import { getTranslations } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { requireUserWithoutConsent } from '@/server/permissions';
import { getDb } from '@/server/db';
import { isCodedError } from '@/lib/errors';
import { CvDownloads } from '@/components/privacy/cv-downloads';
import { PrivacyFrame } from '@/components/privacy/frame';
import { ExportButton } from '@/components/privacy/export-button';
import { Card } from '@/components/ui';
export default async function ExportPage() {
  const t = await getTranslations('privacyScreens.export');
  const actor = await requireUserWithoutConsent().catch((error: unknown) => {
    unstable_rethrow(error);
    if (isCodedError(error)) return null;
    throw error;
  });
  if (!actor) return null;
  const files = await getDb().cvUpload.findMany({
    where: { userId: actor.userId },
    select: { id: true, createdAt: true, storageKey: true },
    orderBy: { createdAt: 'desc' },
  });
  return (
    <PrivacyFrame title={t('title')} description={t('description')}>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{t('includes')}</h2>
        <p className="text-base leading-relaxed text-fg-muted">{t('details')}</p>
      </Card>
      <ExportButton />
      <CvDownloads
        files={files.map((file) => ({
          id: file.id,
          hasFile: file.storageKey !== null,
          date: file.createdAt.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        }))}
      />
    </PrivacyFrame>
  );
}

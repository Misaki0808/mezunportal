import { getTranslations } from 'next-intl/server';
import { PrivacyFrame } from '@/components/privacy/frame';
import { ExportButton } from '@/components/privacy/export-button';
import { Card } from '@/components/ui';
export default async function ExportPage() {
  const t = await getTranslations('privacyScreens.export');
  return (
    <PrivacyFrame title={t('title')} description={t('description')}>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{t('includes')}</h2>
        <p className="text-base leading-relaxed text-fg-muted">{t('details')}</p>
      </Card>
      <ExportButton />
    </PrivacyFrame>
  );
}

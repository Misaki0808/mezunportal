import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import { Badge, Card } from '@/components/ui';
const documents = {
  aydinlatma: 'PRIVACY_NOTICE',
  'kullanim-sartlari': 'TERMS_OF_USE',
  'yurt-disi-aktarim': 'CROSS_BORDER_TRANSFER',
} as const;
export default async function LegalPage({ params }: { params: Promise<{ document: string }> }) {
  const slug = (await params).document;
  const key = documents[slug as keyof typeof documents];
  if (!key) notFound();
  const t = await getTranslations('privacyScreens');
  const sections = t.raw(`documents.${key}.sections`) as { title: string; body: string }[];
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:py-12">
      <Link
        href="/onay"
        className="press-row inline-flex min-h-11 items-center font-medium text-primary"
      >
        ← {t('legal.back')}
      </Link>
      <div>
        <Badge tone="warning">{t('legal.draft')}</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t(`consent.${key}`)}</h1>
        <p className="mt-3 text-base text-fg-muted">
          {t('legal.version', { version: CURRENT_CONSENT_VERSIONS[key] })}
        </p>
      </div>
      <p className="rounded-control bg-warning-soft p-4 text-base text-on-warning-soft">
        {t('legal.placeholder')}
      </p>
      {sections.map((section) => (
        <Card key={section.title}>
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <p className="mt-3 text-base leading-relaxed whitespace-pre-line text-fg-muted">
            {section.body}
          </p>
        </Card>
      ))}
    </article>
  );
}

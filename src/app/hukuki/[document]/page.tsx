import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, getMessages } from 'next-intl/server';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import { Badge, Card } from '@/components/ui';
const documents = {
  aydinlatma: 'PRIVACY_NOTICE',
  'kullanim-sartlari': 'TERMS_OF_USE',
  'yurt-disi-aktarim': 'CROSS_BORDER_TRANSFER',
  'staj-arayan-gorunurlugu': 'JOB_SEEKER_VISIBILITY',
} as const;
export default async function LegalPage({ params }: { params: Promise<{ document: string }> }) {
  const slug = (await params).document;
  const key = documents[slug as keyof typeof documents];
  if (!key) notFound();
  const t = await getTranslations('privacyScreens');
  const catalog = await getMessages();
  const sections = catalog.privacyScreens.documents[key].sections as Record<
    string,
    { title: string; body?: string; items?: Record<string, string> }
  >;
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
      {Object.values(sections).map((section) => (
        <Card key={section.title}>
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.body && (
            <p className="mt-3 text-base leading-relaxed text-fg-muted">{section.body}</p>
          )}
          {section.items && (
            <ul className="mt-3 list-disc space-y-3 pl-5 text-base leading-relaxed text-fg-muted">
              {Object.values(section.items).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </article>
  );
}

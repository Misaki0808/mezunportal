import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PrivacyGuard } from './server-guard';

export async function PrivacyAccountLinks() {
  const t = await getTranslations('privacyScreens.account');
  const links = [
    ['consent', '/onay'],
    ['visibility', '/hesap/gizlilik'],
    ['contacts', '/hesap/iletisim'],
    ['export', '/hesap/veriler'],
    ['delete', '/hesap/hesabi-sil'],
  ] as const;
  return (
    <PrivacyGuard>
      <section className="mt-8" aria-labelledby="privacy-account-heading">
        <h2 id="privacy-account-heading" className="text-xl font-semibold">
          {t('title')}
        </h2>
        <p className="mt-2 text-base text-fg-muted">{t('description')}</p>
        <ul className="mt-4 divide-y divide-border rounded-card border border-border bg-bg">
          {links.map(([id, href]) => (
            <li key={id}>
              <Link
                href={href}
                className="press-row flex min-h-14 items-center justify-between gap-3 px-5 py-3 text-base font-medium text-primary"
              >
                <span>{t(id)}</span>
                <span aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PrivacyGuard>
  );
}

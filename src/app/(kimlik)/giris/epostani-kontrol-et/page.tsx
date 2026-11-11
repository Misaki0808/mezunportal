import { getTranslations } from 'next-intl/server';
import { ActionLink } from '../../action-link';
import { PageHeader } from '@/components/ui';

/** Kayıtlı ve kayıtsız adresler aynı yönlendirmeyi ve metni görür. */
export default async function CheckEmailPage() {
  const t = await getTranslations('authScreens.checkEmail');

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-lg flex-col px-5 pb-8 pt-12 sm:pt-20">
      <div className="flex-1">
        <div
          aria-hidden="true"
          className="mb-7 grid size-16 place-items-center rounded-card bg-primary-soft text-primary-hover"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m4 7 8 6 8-6" />
          </svg>
        </div>
        <PageHeader
          eyebrow={t('eyebrow')}
          title={t.rich('title', {
            email: (chunks) => <span className="whitespace-nowrap">{chunks}</span>,
          })}
          description={t.rich('description', {
            email: (chunks) => <span className="whitespace-nowrap">{chunks}</span>,
          })}
        >
          <p className="mt-6 rounded-card bg-surface p-4 text-base text-fg-muted">
            {t('security')}
          </p>
        </PageHeader>
      </div>
      <ActionLink href="/giris" secondary>
        {t('back')}
      </ActionLink>
    </div>
  );
}

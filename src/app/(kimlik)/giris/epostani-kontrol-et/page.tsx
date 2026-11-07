import { getTranslations } from 'next-intl/server';
import { ActionLink } from '../../action-link';

/** Kayıtlı ve kayıtsız adresler aynı yönlendirmeyi ve metni görür. */
export default async function CheckEmailPage() {
  const t = await getTranslations('authScreens.checkEmail');

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-12 sm:pt-20">
      <div className="flex-1">
        <div
          aria-hidden="true"
          className="mb-7 grid size-16 place-items-center rounded-2xl bg-primary-soft text-primary"
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
        <p className="mb-2 text-base font-semibold text-primary">{t('eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">{t('title')}</h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-fg-muted">{t('description')}</p>
        <p className="mt-6 rounded-card bg-surface p-4 text-base text-fg-muted">{t('security')}</p>
      </div>
      <ActionLink href="/giris" secondary>
        {t('back')}
      </ActionLink>
    </div>
  );
}

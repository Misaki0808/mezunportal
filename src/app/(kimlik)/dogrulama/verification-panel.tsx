import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import type { VerificationState } from '@/contracts/auth';
import { ActionLink } from '../action-link';
import { PageHeader } from '@/components/ui';

export async function VerificationPanel({ state }: { state: VerificationState }) {
  const t = await getTranslations('authScreens.verification');
  const title = {
    VERIFIED: t('verified'),
    NOT_STARTED: t('notStarted'),
    AWAITING_REVIEW: t('awaiting'),
    REJECTED: t('rejected'),
  }[state.status];
  const description = {
    VERIFIED: t('verifiedDescription'),
    NOT_STARTED: t('notStartedDescription'),
    AWAITING_REVIEW: t('awaitingDescription'),
    REJECTED: t('rejectedDescription'),
  }[state.status];
  const showDeclaration = state.status === 'NOT_STARTED' && state.emailKind !== 'OTHER';
  const showUpload =
    state.status === 'REJECTED' || (state.status === 'NOT_STARTED' && state.emailKind === 'OTHER');

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-12 sm:pt-20">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <section aria-live="polite" className="mt-8 rounded-card border border-border bg-surface p-5">
        <h2 className="text-xl font-semibold text-fg">{title}</h2>
        <p className="mt-2 text-base leading-relaxed text-fg-muted">{description}</p>
        {state.status === 'NOT_STARTED' && state.emailKind === 'OTHER' && (
          <p className="mt-3 text-base leading-relaxed text-fg-muted">{t('personalEmailHint')}</p>
        )}
        {state.pendingDocument && (
          <p className="mt-4 text-base text-fg">{state.pendingDocument.departmentName}</p>
        )}
        {state.status === 'REJECTED' && state.rejection && (
          <div className="mt-4 rounded-control bg-bg p-4">
            <h3 className="font-semibold text-fg">{t('reason')}</h3>
            <p className="mt-1 break-words text-base text-fg-muted">{state.rejection.reason}</p>
          </div>
        )}
      </section>
      {(showUpload ||
        showDeclaration ||
        state.status === 'VERIFIED' ||
        state.status === 'AWAITING_REVIEW') && (
        <div className="mt-auto pt-8 pb-[env(safe-area-inset-bottom)]">
          <ActionLink
            href={
              showUpload
                ? '/dogrulama/belge'
                : showDeclaration
                  ? '/dogrulama/uyelik'
                  : state.status === 'AWAITING_REVIEW'
                    ? '/hesap'
                    : '/'
            }
          >
            {showUpload
              ? t(state.status === 'REJECTED' ? 'uploadAgain' : 'upload')
              : showDeclaration
                ? t('declare')
                : state.status === 'AWAITING_REVIEW'
                  ? t('account')
                  : t('home')}
          </ActionLink>
          {state.status === 'NOT_STARTED' && state.emailKind === 'OTHER' && (
            <Link
              href="/hesap/e-posta"
              className="mt-3 inline-flex min-h-11 items-center font-medium text-primary"
            >
              {t('changeEmail')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

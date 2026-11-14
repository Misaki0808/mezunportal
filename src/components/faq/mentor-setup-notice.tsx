'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EmptyState, buttonClasses } from '@/components/ui';

/**
 * Mentor olabilen ama mentor ayarını henüz kaydetmeyen kullanıcı `/mentor/sss`'e gelince "rolün için değil" yerine yol
 * gösterilir (CV inceleme ekranındaki "hazırlan" açıklamasıyla aynı kalıp).
 */
export function MentorSetupNotice() {
  const t = useTranslations('faq.mentorSetup');
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <EmptyState
        title={t('title')}
        description={t('description')}
        action={
          <Link href="/mentor/ayarlar" className={buttonClasses()}>
            {t('action')}
          </Link>
        }
      />
    </div>
  );
}

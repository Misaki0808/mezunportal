import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { ExperienceForm } from '@/components/experience/experience-form';
import { loadVerifiedDepartments } from '@/components/experience/verified-departments';
import { buttonClasses, EmptyState, ErrorState } from '@/components/ui';
import { saveExperienceDraft, submitExperience } from '@/server/actions/experience';

export const dynamic = 'force-dynamic';

export default async function NewExperiencePage() {
  const [loaded, t] = await Promise.all([
    loadVerifiedDepartments(),
    getTranslations('experiences.form'),
  ]);
  if (!loaded.ok) return <ErrorState errorCode={loaded.errorCode} />;
  if (loaded.departments.length === 0) {
    return (
      <div className="mx-auto w-full max-w-lg px-5 py-10">
        <EmptyState
          title={t('noDepartmentTitle')}
          description={t('noDepartmentDescription')}
          action={
            <Link className={buttonClasses({ size: 'lg' })} href="/dogrulama">
              {t('noDepartmentAction')}
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <ExperienceForm
      departments={loaded.departments}
      save={saveExperienceDraft}
      submit={submitExperience}
    />
  );
}

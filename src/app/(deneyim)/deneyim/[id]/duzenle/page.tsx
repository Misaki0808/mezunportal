import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { ExperienceForm } from '@/components/experience/experience-form';
import { stateFromContent } from '@/components/experience/form-state';
import { loadVerifiedDepartments } from '@/components/experience/verified-departments';
import { buttonClasses, EmptyState, ErrorState } from '@/components/ui';
import {
  getExperienceDetail,
  saveExperienceDraft,
  submitExperience,
} from '@/server/actions/experience';

export const dynamic = 'force-dynamic';

export default async function EditExperiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, loaded, t] = await Promise.all([
    getExperienceDetail({ experienceId: id }).catch(() => null),
    loadVerifiedDepartments(),
    getTranslations('experiences'),
  ]);
  if (!detail) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!detail.ok) return <ErrorState errorCode={detail.errorCode} />;
  if (!loaded.ok) return <ErrorState errorCode={loaded.errorCode} />;
  const experience = detail.data;
  // Yalnız taslak ve reddedilen düzenlenir (sunucu da `EXPERIENCE_NOT_EDITABLE` ile korur).
  if (experience.status !== 'DRAFT' && experience.status !== 'REJECTED') {
    return (
      <div className="mx-auto w-full max-w-lg px-5 py-10">
        <EmptyState
          title={t('form.notEditableTitle')}
          description={t('form.notEditableDescription')}
          action={
            <Link className={buttonClasses({ size: 'lg' })} href="/deneyimlerim">
              {t('form.submittedAction')}
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <ExperienceForm
      departments={loaded.departments}
      initial={{
        id: experience.id,
        departmentId: experience.departmentIdAtWrite,
        state: stateFromContent(experience.content),
        isAnonymous: experience.isAnonymous,
        moderationNote: experience.moderationNote,
      }}
      save={saveExperienceDraft}
      submit={submitExperience}
    />
  );
}

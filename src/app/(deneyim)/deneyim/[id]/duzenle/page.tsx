import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { ExperienceForm } from '@/components/experience/experience-form';
import { stateFromContent } from '@/components/experience/form-state';
import { loadVerifiedDepartments } from '@/components/experience/verified-departments';
import { buttonClasses, EmptyState, ErrorState } from '@/components/ui';
import { saveExperienceDraft, submitExperience } from '@/server/actions/experience';
import { requestEditableExperience, requestOwnAppliedMonth } from '@/app/detail-route';

export const dynamic = 'force-dynamic';

export default async function EditExperiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, loaded, t] = await Promise.all([
    requestEditableExperience(id).catch(() => null),
    loadVerifiedDepartments(),
    getTranslations('experiences'),
  ]);
  if (!detail) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!detail.ok && detail.errorCode === 'RESOURCE_NOT_FOUND') notFound();
  if (!detail.ok) return <ErrorState errorCode={detail.errorCode} />;
  if (!loaded.ok) return <ErrorState errorCode={loaded.errorCode} />;
  const experience = detail.data;
  // Yalnız taslak ve reddedilen düzenlenir (sunucu da `EXPERIENCE_NOT_EDITABLE` ile korur).
  if (experience.status !== 'DRAFT' && experience.status !== 'REJECTED') {
    return (
      <div className="w-full max-w-lg">
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
  const month = await requestOwnAppliedMonth(id);
  if (!month.ok && month.errorCode === 'RESOURCE_NOT_FOUND') notFound();
  if (!month.ok) return <ErrorState errorCode={month.errorCode} />;
  return (
    <ExperienceForm
      departments={loaded.departments}
      initial={{
        id: experience.id,
        departmentId: experience.departmentIdAtWrite,
        state: stateFromContent(experience.content),
        isAnonymous: experience.isAnonymous,
        moderationNote: experience.moderationNote,
        appliedMonth: month.data.appliedMonth,
      }}
      save={saveExperienceDraft}
      submit={submitExperience}
    />
  );
}

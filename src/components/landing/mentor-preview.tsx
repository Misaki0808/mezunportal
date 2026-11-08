'use client';

import { useTranslations } from 'next-intl';
import { MentorCard } from '@/components/mentors/mentor-card';

/** Gerçek mentor kartı, kişiye ait olmayan örnek veriyle ve etkileşimsiz telefon maketinde gösterilir. */
export function MentorPreview() {
  const t = useTranslations('landing');
  return (
    <div className="landing-real-mentor">
      <MentorCard
        compact
        mentor={{
          userId: 'ornek',
          displayName: t('previewMentor'),
          headline: t('previewMentorMeta'),
          mentorType: 'ALUMNI',
          departmentName: t('previewDepartment'),
          graduationYear: null,
          position: null,
          sectorName: null,
          topics: [],
          skills: [],
          availability: { available: true, reason: null, pausedUntil: null },
          capacity: { monthly: 4, used: 0, remaining: 4 },
          sessionMinutes: 30,
          meetingModes: ['ONLINE'],
          cvReviewEnabled: false,
        }}
      />
    </div>
  );
}

'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Sheet } from '@/components/ui';
import type { CvReviewAvailability } from '@/contracts/cv-review-request';
import { RequestForm } from './request-form';
export function ReviewRequestEntry({
  mentorId,
  availability,
}: {
  mentorId: string;
  availability: CvReviewAvailability;
}) {
  const t = useTranslations('cvReview');
  const [open, setOpen] = useState(false);
  if (!availability.available)
    return (
      <Button disabled disabledReason={t(`unavailable.${availability.reason ?? 'NOT_MENTOR'}`)}>
        {t('requestLink')}
      </Button>
    );
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t('requestLink')}</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('requestTitle')}>
        <RequestForm mentorId={mentorId} availability={availability} embedded />
      </Sheet>
    </>
  );
}

'use client';
import { useState } from 'react';
import Link from 'next/link';
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
      <div>
        <Button disabled disabledReason={t(`unavailable.${availability.reason ?? 'NOT_MENTOR'}`)}>
          {t('requestLink')}
        </Button>
        {availability.reason === 'NO_CV' && (
          <Link href="/profil/cv" className="mt-2 inline-flex min-h-11 items-center text-primary">
            {t('toCv')} →
          </Link>
        )}
      </div>
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

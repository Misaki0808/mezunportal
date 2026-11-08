import { CvFlow } from '@/components/profile/cv-flow';
import { ErrorState } from '@/components/ui';
import {
  applyCv,
  discardCv,
  getCvAvailability,
  getCvReview,
  getCvStatus,
  getLatestCv,
  uploadCv,
} from '@/server/actions/cv';

export const dynamic = 'force-dynamic';

export default async function CvPage() {
  const [availability, latest] = await Promise.all([
    getCvAvailability().catch(() => null),
    getLatestCv().catch(() => null),
  ]);
  if (!availability || !latest) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!availability.ok) return <ErrorState errorCode={availability.errorCode} />;
  if (!latest.ok) return <ErrorState errorCode={latest.errorCode} />;
  // Sonuç hazırsa (PARSED) onay verisi sunucuda yüklenir: sayfa yenilenince kaldığı yerden sürer.
  const review =
    latest.data?.status === 'PARSED'
      ? await getCvReview({ cvUploadId: latest.data.cvUploadId }).catch(() => null)
      : null;
  return (
    <CvFlow
      availability={availability.data}
      latest={latest.data}
      initialReview={review?.ok ? review.data : undefined}
      actions={{
        upload: uploadCv,
        getStatus: getCvStatus,
        getReview: getCvReview,
        apply: applyCv,
        discard: discardCv,
      }}
    />
  );
}

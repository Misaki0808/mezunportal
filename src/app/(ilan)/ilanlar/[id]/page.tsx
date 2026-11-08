import { PostingDetail } from '@/components/job-postings/detail';
import { ErrorState } from '@/components/ui';
import { getJobPosting, previewJobPostingContact } from '@/server/actions/job-postings';
export const dynamic = 'force-dynamic';
export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getJobPosting({ id });
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  // Yalnız okuyucuya gerekli alanlar: geçiş dönemindeki servis yanıtından yazar kimliği istemciye geçmez.
  const {
    id: postingId,
    kind,
    title,
    organizationName,
    companyId,
    location,
    isRemote,
    deadlineOn,
    daysLeft,
    applyMethod,
    publishedAt,
    authorKind,
    matchTags,
    targetDepartments,
    description,
    applyUrl,
  } = result.data;
  const contact =
    applyMethod === 'CONTACT_REQUEST'
      ? await previewJobPostingContact({ jobPostingId: postingId }).catch(() => null)
      : null;
  return (
    <PostingDetail
      canRequestContact={contact?.ok === true && contact.data.canRequest}
      posting={{
        id: postingId,
        kind,
        title,
        organizationName,
        companyId,
        location,
        isRemote,
        deadlineOn,
        daysLeft,
        applyMethod,
        publishedAt,
        authorKind,
        matchTags,
        targetDepartments,
        description,
        applyUrl,
      }}
    />
  );
}

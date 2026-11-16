import { getMyPhotoState } from '@/server/actions/profile-photo';
import { PhotoManager } from '@/components/profile-photo/photo-manager';
import { ErrorState } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function PhotoPage() {
  const result = await getMyPhotoState();
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return <PhotoManager {...result.data} />;
}

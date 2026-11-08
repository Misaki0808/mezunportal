import { ProfileView } from '@/components/profile/profile-view';
import { ErrorState } from '@/components/ui';
import { getProfile } from '@/server/actions/profile-content';

export const dynamic = 'force-dynamic';

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const result = await getProfile({ userId }).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  // Var olmayan, silinmiş ya da görünmeyen kullanıcı aynı yanıtı alır (sunucu RESOURCE_NOT_FOUND döner).
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return <ProfileView profile={result.data} />;
}

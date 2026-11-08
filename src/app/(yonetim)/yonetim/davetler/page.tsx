import { adminAccess } from '@/components/admin/access';
import { Invitations } from '@/components/admin/invitations';
import { ErrorState } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function InvitationsPage() {
  const access = await adminAccess('dictionaries');
  if (!access.ok) return <ErrorState errorCode={access.errorCode} />;
  return <Invitations />;
}

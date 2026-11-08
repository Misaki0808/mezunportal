import { DeleteForm } from '@/components/privacy/delete-form';
import { requireUserWithoutConsent } from '@/server/permissions';
import { getDb } from '@/server/db';
export const dynamic = 'force-dynamic';
export default async function DeletePage() {
  const actor = await requireUserWithoutConsent().catch(() => null);
  if (!actor) return null; // Oturum ve rıza yönlendirmesi üst düzenin PrivacyGuard'ındadır.
  const user = await getDb().user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { email: true },
  });
  return <DeleteForm currentEmail={user.email} />;
}

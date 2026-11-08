import { DeleteForm } from '@/components/privacy/delete-form';
import { requireUser } from '@/server/permissions';
import { getDb } from '@/server/db';
export default async function DeletePage() {
  const actor = await requireUser();
  const user = await getDb().user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { email: true },
  });
  return <DeleteForm currentEmail={user.email} />;
}

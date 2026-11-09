import { ErrorState } from '@/components/ui';
import { StoryEditor } from '@/components/alumni-story/editor';
import { getDb } from '@/server/db';
import { listMyStories } from '@/server/actions/alumni-story';
import { requireVerifiedMember } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function MyStoryPage() {
  const actor = await requireVerifiedMember({ roles: ['ALUMNI'] }).catch(() => null);
  if (!actor) return <ErrorState errorCode="AUTH_FORBIDDEN" />;
  const ids = actor.facts.memberships
    .filter((m) => m.role === 'ALUMNI' && m.verificationStatus === 'VERIFIED' && m.endedAt === null)
    .map((m) => m.departmentId);
  const [departments, stories] = await Promise.all([
    getDb().department.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    listMyStories(),
  ]);
  return stories.ok ? (
    <StoryEditor departments={departments} initial={stories.data} />
  ) : (
    <ErrorState errorCode={stories.errorCode} />
  );
}

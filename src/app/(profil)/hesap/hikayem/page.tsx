import { guardPage } from '@/server/permissions/page-guard';
import { ErrorState } from '@/components/ui';
import { StoryEditor } from '@/components/alumni-story/editor';
import { getDb } from '@/server/db';
import { listMyStories } from '@/server/actions/alumni-story';
import { requirePageVerifiedMember as requireVerifiedMember } from '@/server/permissions';
export const dynamic = 'force-dynamic';
export default async function MyStoryPage() {
  const guarded = await guardPage('page.myStory', () =>
    requireVerifiedMember({ roles: ['ALUMNI'] }),
  );
  if (!guarded.ok) return <ErrorState errorCode={guarded.errorCode} />;
  const actor = guarded.value;
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

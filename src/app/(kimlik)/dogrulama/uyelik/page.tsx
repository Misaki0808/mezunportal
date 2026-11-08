import { redirect } from 'next/navigation';

import { ErrorState } from '@/components/ui';
import {
  declareMembership,
  getVerificationState,
  listSelectableDepartments,
} from '@/server/actions/auth';

import { MembershipForm } from './membership-form';

export const dynamic = 'force-dynamic';
export default async function MembershipPage() {
  const [state, departments] = await Promise.all([
    getVerificationState(),
    listSelectableDepartments(),
  ]).catch(() => [null, null] as const);
  if (!state || !departments) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!state.ok) return <ErrorState errorCode={state.errorCode} />;
  if (!departments.ok) return <ErrorState errorCode={departments.errorCode} />;
  if (state.data.status !== 'NOT_STARTED' || state.data.emailKind === 'OTHER')
    redirect('/dogrulama');
  const role = state.data.emailKind === 'STUDENT_DOMAIN' ? 'STUDENT' : 'ACADEMIC';
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-12 sm:pt-20">
      <MembershipForm
        role={role}
        departments={departments.data.departments}
        submit={declareMembership}
      />
    </div>
  );
}

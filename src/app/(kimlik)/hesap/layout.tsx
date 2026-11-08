import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { ErrorState } from '@/components/ui';
import { REQUEST_PATH_HEADER } from '@/lib/return-path';
import { getFeedbackView } from '@/server/actions/feedback';

export default async function ConsentLayout({ children }: { children: ReactNode }) {
  const guarded = await PrivacyGuard({ children });
  if (guarded !== children) return guarded;
  const path = (await headers()).get(REQUEST_PATH_HEADER)?.split('?')[0] ?? '';
  const match = /^\/hesap\/gorusme\/([^/]+)\/?$/.exec(path);
  if (match) {
    let id: string;
    try {
      id = decodeURIComponent(match[1]!);
    } catch {
      notFound();
    }
    const result = await getFeedbackView(id);
    if (!result.ok) {
      if (result.errorCode === 'RESOURCE_NOT_FOUND' || result.errorCode === 'AUTH_FORBIDDEN')
        notFound();
      return <ErrorState errorCode={result.errorCode} />;
    }
  }
  return guarded;
}

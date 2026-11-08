import { notFound } from 'next/navigation';
import { requireUser } from '@/server/permissions';
import { FixtureFlow } from './fixture-flow';

/** Yalnız Playwright'ın sahte sunucu yanıtlarıyla ekranı denemesi için; prod ve local'de yok. */
export const dynamic = 'force-dynamic';
export default async function OnboardingTestPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  if (process.env.APP_ENV !== 'test') notFound();
  await requireUser();
  return <FixtureFlow requestedStep={(await searchParams).step} />;
}

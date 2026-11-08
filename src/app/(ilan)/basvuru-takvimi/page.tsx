import { CalendarPage } from '@/components/application-window/calendar';
import { ErrorState } from '@/components/ui';
import { getApplicationCalendar } from '@/server/actions/application-window';
import { getDb } from '@/server/db';
import { requireVerifiedMember } from '@/server/permissions';
import type { ApplicationScope } from '@/contracts/application-window';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireVerifiedMember();
  const raw = await searchParams;
  const companyId = typeof raw.companyId === 'string' ? raw.companyId : '';
  const sectorId = typeof raw.sectorId === 'string' ? raw.sectorId : '';
  const scope: ApplicationScope | null = companyId
    ? { kind: 'COMPANY', id: companyId }
    : sectorId
      ? { kind: 'SECTOR', id: sectorId }
      : null;
  const db = getDb();
  const [companies, sectors, data] = await Promise.all([
    db.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.sector.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    scope ? getApplicationCalendar(scope) : null,
  ]);
  if (data && !data.ok) return <ErrorState errorCode={data.errorCode} />;
  return (
    <CalendarPage companies={companies} sectors={sectors} scope={scope} data={data?.data ?? null} />
  );
}

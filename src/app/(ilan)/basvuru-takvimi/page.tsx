import { idTextSchema } from '@/lib/id-text';
import { sortByTurkishName } from '@/lib/turkish-sort';
import { CalendarPage } from '@/components/application-window/calendar';
import { ErrorState } from '@/components/ui';
import { getApplicationCalendar, listCalendarCompanies } from '@/server/actions/application-window';
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
  // Geçersiz kimlik (boş, uzun, denetim karakterli) sessizce seçimsiz varsayılana düşer; sorguya hiç gitmez.
  const idOf = (value: string | string[] | undefined) => {
    const parsed = idTextSchema().safeParse(value);
    return parsed.success ? parsed.data : '';
  };
  const companyId = idOf(raw.companyId);
  const sectorId = idOf(raw.sectorId);
  const scope: ApplicationScope | null = companyId
    ? { kind: 'COMPANY', id: companyId }
    : sectorId
      ? { kind: 'SECTOR', id: sectorId }
      : null;
  const db = getDb();
  // Şirket seçicisi yalnız takvimde kaydı olan şirketleri (ve URL'den gelen seçili şirketi) taşır; hepsini gömmez.
  const [companies, sectors, result] = await Promise.all([
    listCalendarCompanies(companyId || undefined),
    db.sector.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    scope ? getApplicationCalendar(scope) : null,
  ]);
  // Olmayan şirket/sektör kimliği de geçersiz parametre gibi seçimsiz varsayılana düşer (404 gövdesi yok).
  const missing = result && !result.ok && result.errorCode === 'RESOURCE_NOT_FOUND';
  if (!companies.ok) return <ErrorState errorCode={companies.errorCode} />;
  if (result && !result.ok && !missing) return <ErrorState errorCode={result.errorCode} />;
  return (
    <CalendarPage
      companies={sortByTurkishName(companies.data)}
      sectors={sortByTurkishName(sectors)}
      scope={missing ? null : scope}
      data={result?.ok ? result.data : null}
    />
  );
}

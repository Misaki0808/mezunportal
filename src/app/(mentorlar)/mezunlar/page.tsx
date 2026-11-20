import { redirect } from 'next/navigation';
import { AlumniDirectory } from '@/components/alumni/alumni-directory';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { ErrorState } from '@/components/ui';
import { alumniSearchSchema } from '@/contracts/alumni-directory';
import { capPage, parseListFilters } from '@/lib/list-params';
import { searchAlumni } from '@/server/actions/alumni-directory';
import { listSearchSectors } from '@/server/actions/search';

export const dynamic = 'force-dynamic';
export default async function AlumniPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const input = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => typeof value === 'string' && value.trim() !== ''),
  );
  // Geçersiz parametre sessizce varsayılana düşer; `page` üst sınırı (1000) aşılırsa sınıra indirilir, hizmet son sayfaya çeker.
  const parsed = parseListFilters(alumniSearchSchema, capPage(input, 1000));
  const [results, sectors] = await Promise.all([searchAlumni(parsed), listSearchSectors()]);
  if (!results.ok)
    return (
      <PrivacyGuard>
        <ErrorState errorCode={results.errorCode} />
      </PrivacyGuard>
    );
  if (!sectors.ok)
    return (
      <PrivacyGuard>
        <ErrorState errorCode={sectors.errorCode} />
      </PrivacyGuard>
    );
  // Aralık dışı sayfa: hizmet son geçerli sayfayı döndürür; adres de ona düzeltilir (404 yok).
  if (results.data.page < parsed.page) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(parsed))
      if (key !== 'page' && value !== undefined) next.set(key, String(value));
    if (results.data.page > 1) next.set('page', String(results.data.page));
    redirect(`/mezunlar${next.size ? `?${next}` : ''}`);
  }
  return (
    <PrivacyGuard>
      <AlumniDirectory
        key={JSON.stringify(parsed)}
        filter={parsed}
        results={results.data}
        sectors={sectors.data.sectors}
      />
    </PrivacyGuard>
  );
}

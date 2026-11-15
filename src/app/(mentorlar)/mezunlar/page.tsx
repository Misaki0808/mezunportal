import { AlumniDirectory } from '@/components/alumni/alumni-directory';
import { PrivacyGuard } from '@/components/privacy/server-guard';
import { ResetLink } from '@/components/directory/reset-link';
import { ErrorState } from '@/components/ui';
import { alumniSearchSchema } from '@/contracts/alumni-directory';
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
  const parsed = alumniSearchSchema.safeParse(input);
  if (!parsed.success)
    return (
      <PrivacyGuard>
        <ErrorState errorCode="VALIDATION_INVALID" />
        <ResetLink href="/mezunlar" />
      </PrivacyGuard>
    );
  const [results, sectors] = await Promise.all([searchAlumni(parsed.data), listSearchSectors()]);
  if (!results.ok)
    return (
      <PrivacyGuard>
        <ErrorState errorCode={results.errorCode} />
      </PrivacyGuard>
    );
  return (
    <PrivacyGuard>
      <AlumniDirectory
        key={JSON.stringify(parsed.data)}
        filter={parsed.data}
        results={results.data}
        sectors={sectors.ok ? sectors.data.sectors : []}
      />
    </PrivacyGuard>
  );
}

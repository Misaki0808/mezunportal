import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { adminAccess } from '@/components/admin/access';
import { Dictionaries } from '@/components/admin/dictionaries';
import { ErrorState } from '@/components/ui';
import {
  createDictionaryEntry,
  deleteDictionaryEntry,
  listDictionaryEntries,
  updateDictionaryEntry,
} from '@/server/actions/admin';
export const dynamic = 'force-dynamic';
export default async function DictionariesPage() {
  const access = await adminAccess('dictionaries');
  if (!access.ok) return <ErrorState errorCode={access.errorCode} />;
  const [result, sectors] = await Promise.all([
    listDictionaryEntries({ kind: 'COMPANY' }).catch(() => null),
    listDictionaryEntries({ kind: 'SECTOR', limit: 50 }).catch(() => null),
  ]);
  if (!result || !sectors) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  if (!sectors.ok) return <ErrorState errorCode={sectors.errorCode} />;
  const t = await getTranslations('companies');
  const course = await getTranslations('courseGuide');
  return (
    <>
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <Link
          href="/yonetim/sozlukler/birlestir"
          className="inline-flex min-h-11 items-center font-semibold text-primary"
        >
          {t('mergeTitle')} →
        </Link>
      </div>
      <div className="mx-auto max-w-5xl px-4">
        <Link
          href="/yonetim/dersler"
          className="inline-flex min-h-11 items-center font-semibold text-primary"
        >
          {course('adminLink')} →
        </Link>
      </div>
      <Dictionaries
        initial={result.data}
        sectors={sectors.data.items}
        list={listDictionaryEntries}
        create={createDictionaryEntry}
        update={updateDictionaryEntry}
        remove={deleteDictionaryEntry}
      />
    </>
  );
}

import { FaqList } from '@/components/faq/faq-list';
import { ErrorState } from '@/components/ui';
import { searchFaqSchema } from '@/contracts/faq';
import { searchFaq } from '@/server/actions/faq';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function FaqPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = first(params.q)?.trim() || undefined;
  const page = Number(first(params.page) ?? '1');
  const parsed = searchFaqSchema.safeParse({
    ...(q ? { q } : {}),
    page: Number.isFinite(page) ? page : 1,
  });
  // Geçersiz sorgu (ör. tek harf) hata ekranı değil, filtresiz liste: kullanıcı yeniden arayabilir.
  const input = parsed.success ? parsed.data : searchFaqSchema.parse({});
  const result = await searchFaq(input).catch(() => null);
  if (!result) return <ErrorState errorCode="SERVER_UNEXPECTED" />;
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return <FaqList result={result.data} q={parsed.success ? q : undefined} />;
}

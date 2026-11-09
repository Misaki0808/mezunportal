import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthEnv } from '@/lib/env';
import { getDb } from '@/server/db';
import { getRequestContext } from '@/server/auth/request-context';
import { consumeRateLimit, rateLimitKey } from '@/server/auth/rate-limit';
import { publicAward } from '@/server/services/year-alumni';
import { BadgeCheckIcon, Card, IconChip, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
/** Kamuya açık doğrulama: oturum ve genel rıza gerekmez; yalnız ödüle ait açık yayın rızası aranır. */
export default async function VerificationPage({ params }: { params: Promise<{ kod: string }> }) {
  const { kod } = await params;
  const { clientIp } = await getRequestContext();
  const db = getDb();
  const key = rateLimitKey(
    'award-verification',
    clientIp ?? 'unknown',
    getAuthEnv().BETTER_AUTH_SECRET,
  );
  const rate = await consumeRateLimit(db, key, { max: 60, windowSeconds: 60 });
  if (!rate.allowed) notFound();
  const award = await publicAward(db, kod);
  if (!award) notFound();
  const t = await getTranslations('yearAlumni');
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <PageHeader
        eyebrow={t('awardName')}
        title={t('verifyTitle')}
        description={t('verifyIntro')}
      />
      <Card className="mt-8 space-y-5 p-6">
        <IconChip tone="success">
          <BadgeCheckIcon />
        </IconChip>
        <p className="text-2xl font-semibold">{award.name}</p>
        <p className="text-lg">
          {award.award} · {t('awardYear', { year: award.year })}
        </p>
        <p>
          {award.department} · {award.university}
        </p>
      </Card>
    </main>
  );
}

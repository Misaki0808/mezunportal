import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AdminFrame } from '@/components/admin/frame';
import { ErrorState } from '@/components/ui';
import { getAdminFeedback } from '@/server/actions/admin-feedback';

export const dynamic = 'force-dynamic';
export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const { before } = await searchParams;
  const [result, t] = await Promise.all([
    getAdminFeedback(before ? { before } : {}),
    getTranslations('feedback'),
  ]);
  if (!result.ok) return <ErrorState errorCode={result.errorCode} />;
  return (
    <AdminFrame title={t('adminTitle')} description={t('adminDescription')}>
      {result.data.items.length === 0 ? (
        <p>{t('adminEmpty')}</p>
      ) : (
        <ul className="space-y-4">
          {result.data.items.map((item) => (
            <li
              key={item.id}
              className="space-y-3 rounded-card border border-border bg-surface p-4"
            >
              <p className="font-semibold">
                {item.mentorName} · {item.studentName}
              </p>
              <p>{t(item.role === 'MENTOR' ? 'adminRoleMENTOR' : 'adminRoleMENTEE')}</p>
              <time dateTime={item.createdAt.toISOString()} className="block text-sm text-fg-muted">
                {new Intl.DateTimeFormat('tr-TR', {
                  dateStyle: 'long',
                  timeStyle: 'short',
                  timeZone: 'Europe/Istanbul',
                }).format(item.createdAt)}
              </time>
              {!item.happened ? (
                <p>{t('adminNotHeld')}</p>
              ) : (
                <>
                  {item.answers.map(
                    (answer, index) =>
                      answer && (
                        <p key={index}>
                          {t(`questions.${item.role}.${index as 0 | 1 | 2}`)}{' '}
                          <strong>
                            {t(`answers.${item.role}.${index as 0 | 1 | 2}.${answer}`)}
                          </strong>
                        </p>
                      ),
                  )}
                  {item.answers[1] === null && item.helpful !== null && (
                    <p>
                      {t('helpful')} {t(item.helpful ? 'helpfulYes' : 'helpfulNo')}
                    </p>
                  )}
                  {item.ratingHalf !== null && (
                    <p>
                      {t('adminRating', {
                        rating: new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(
                          item.ratingHalf / 2,
                        ),
                      })}
                    </p>
                  )}
                </>
              )}
              {item.note && (
                <p className="whitespace-pre-wrap break-words">
                  {t('adminNote', { note: item.note })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {result.data.nextCursor && (
        <Link
          className="mt-4 inline-flex min-h-11 items-center text-primary underline"
          href={`/yonetim/gorusme-geri-bildirimleri?before=${encodeURIComponent(result.data.nextCursor)}`}
        >
          {t('adminMore')}
        </Link>
      )}
    </AdminFrame>
  );
}

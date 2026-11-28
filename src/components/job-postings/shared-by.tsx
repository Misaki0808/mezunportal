'use client';
import { useTranslations } from 'next-intl';
import type { JobPostingCard } from '@/contracts/job-postings';

/**
 * Öğrencinin paylaştığı ilanın türü açık yazılır ("Bir öğrenci paylaştı · Kaynak: alan adı"): okuyucu ilanın başka bir yerden
 * geldiğini ve kabul garantisi taşımadığını anlar. Paylaşanın adı yoktur (okuyucu çıktısında yazar adı bulunmaz). Mezun ve
 * akademisyen ilanlarında hiçbir şey çizilmez (görünüm değişmez).
 */
export function SharedBy({
  posting,
  className,
  stacked = false,
}: {
  posting: Pick<JobPostingCard, 'authorKind' | 'sourceHost'>;
  className?: string;
  /** Ayrıntıda iki satır: alan adı satır sonunda ortadan bölünmesin. Kartta tek satır. */
  stacked?: boolean;
}) {
  const t = useTranslations('jobs');
  if (posting.authorKind !== 'STUDENT') return null;
  const source = posting.sourceHost ? t('sharedSource', { host: posting.sourceHost }) : null;
  return (
    <p className={className} data-shared-by="student">
      <span className={stacked ? 'block' : undefined}>{t('sharedByStudent')}</span>
      {source &&
        (stacked ? (
          <span className="block break-words">{source}</span>
        ) : (
          <>
            {' · '}
            <span className="break-all">{source}</span>
          </>
        ))}
    </p>
  );
}

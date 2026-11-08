import { useTranslations } from 'next-intl';

import type { SimilarMentors as SimilarMentorsData } from '@/contracts/mentor-directory';
import { Badge } from '@/components/ui';

import { MentorCard } from './mentor-card';
import type messages from '../../../messages/tr.json';

type TopicKey = keyof typeof messages.profileTags;

/**
 * “Sana benzer yol izleyenler”: en çok 5 mentor; her biri GEREKÇE etiketleriyle görünür (kullanıcı neden önerildiğini
 * görür). Gerekçe değerleri yalnız arayanın da sahip olduğu ortak öğelerdir (sunucu süzer); ilgi/hedef anahtarları
 * mesaj kataloğundaki adlarına çevrilir.
 */
export function SimilarMentors({ data }: { data: SimilarMentorsData }) {
  const t = useTranslations('mentors.similar');
  const tags = useTranslations('profileTags');
  if (data.items.length === 0) return null;
  const valueOf = (code: string, value: string) =>
    (code === 'SHARED_INTEREST' || code === 'SHARED_GOAL') && tags.has(value as TopicKey)
      ? tags(value as TopicKey)
      : value;
  return (
    <section aria-labelledby="similar-title" className="mb-8">
      <h2 id="similar-title" className="text-xl font-semibold text-fg">
        {t('title')}
      </h2>
      <p className="mt-1 text-base text-fg-muted">{t('description')}</p>
      <ul className="mt-4 flex flex-col gap-4">
        {data.items.map((item) => (
          <li key={item.mentor.userId}>
            <MentorCard mentor={item.mentor} compact />
            <ul aria-label={t('because')} className="mt-2 flex flex-wrap gap-2">
              {item.reasons.map((reason) => (
                <li key={reason.code}>
                  <Badge tone="info">
                    {t(`reasons.${reason.code}`)}:{' '}
                    {reason.values.map((value) => valueOf(reason.code, value)).join(', ')}
                  </Badge>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

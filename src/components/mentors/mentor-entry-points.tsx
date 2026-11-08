'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

import type { MentorEntryPoints as EntryPoints } from '@/contracts/mentor-directory';
import { buttonClasses } from '@/components/ui';

/**
 * Profildeki giriş noktaları. Yalnız uygunluk bayrağından çizilir: kapalı olan giriş sebebiyle açıklanır; randevu ve
 * CV incelemesi eylemi kendi kartında (P1-15) gelene kadar açık bayrak için düğme çizilmez (“yakında” yazısı
 * yok); iletişim talebi ve randevu al (P1-10) bağlıdır.
 */
export function MentorEntryPoints({ userId, entry }: { userId: string; entry: EntryPoints }) {
  const t = useTranslations('mentors.entry');
  // Mentor değilse bölüm hiç çizilmez (varlık/rol ayrımı sızmaz).
  if (entry.contact.reason === 'NOT_MENTOR' || entry.contact.reason === 'SELF') return null;
  const blocked = [
    entry.appointment.available ? null : ['appointment', entry.appointment.reason],
    entry.cvReview.available ? null : ['cv', entry.cvReview.reason],
  ].filter(
    (item): item is [string, NonNullable<typeof entry.appointment.reason>] =>
      item !== null && item[1] !== null,
  );
  return (
    <section
      aria-labelledby="entry-title"
      className="flex flex-col gap-3 rounded-card border border-border p-4"
    >
      <h2 id="entry-title" className="text-xl font-semibold text-fg">
        {t('title')}
      </h2>
      {entry.contact.available ? (
        <Link className={buttonClasses({ fullWidth: true })} href={`/iletisim-iste/${userId}`}>
          {t('contact')}
        </Link>
      ) : (
        <p className="text-base text-fg-muted">
          {entry.contact.reason ? t(`reasons.${entry.contact.reason}`) : t('contactBlocked')}
        </p>
      )}
      {entry.appointment.available && (
        <Link className={buttonClasses({ fullWidth: true })} href={`/randevu-al/${userId}`}>
          {t('appointment')}
        </Link>
      )}
      {blocked.length > 0 && (
        <ul className="flex flex-col gap-1 text-base text-fg-muted">
          {blocked.map(([kind, reason]) => (
            <li key={kind}>{t(`reasons.${reason}`)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

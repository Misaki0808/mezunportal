import { useTranslations } from 'next-intl';

import type { ExperienceDetail } from '@/contracts/experience';

type Content = ExperienceDetail['content'];
type Row = { label: string; value: string };

/** Sıra numarası çipi (dekoratif; sıra liste anlamından gelir). */
function NumberChip({ children }: { children: number }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-on-primary-soft"
    >
      {children}
    </span>
  );
}

/** Deneyim içeriği (okuma). Moderasyon kuyruğu, detay ve liste aynı görünümü kullanır; yazar bilgisi içermez. */
export function ExperienceContent({
  content,
  showOrganization = true,
  layout = 'stacked',
}: {
  content: Content;
  /** Sayfa başlığı kurumu zaten söylüyorsa (detay) `false`: aynı bilgi iki kez yazılmaz. */
  showOrganization?: boolean;
  /**
   * `split` (detay sayfası): ≥ lg'de okunur metin genişliği (~70 karakter) solda, künye kutusu (şirket, dönem, yer, süre…) sağda
   * yapışkan; telefonda künye üstte. `stacked` (moderasyon kuyruğu): eski tek sütun.
   */
  layout?: 'stacked' | 'split';
}) {
  const t = useTranslations('experiences');
  const read = content as Record<string, unknown>;
  const text = (key: string) => (typeof read[key] === 'string' ? (read[key] as string) : '');
  const rows: Row[] = [];
  if (showOrganization && text('organizationName'))
    rows.push({
      label: content.type === 'DAILY_LIFE' ? t('detail.topic') : t('detail.organization'),
      value: text('organizationName'),
    });
  const season = text('termSeason');
  const year = read.termYear;
  if (season || year) {
    rows.push({
      label: t('detail.term'),
      value: [season ? t(`seasons.${season as 'SPRING'}`) : '', year ? String(year) : '']
        .filter(Boolean)
        .join(' '),
    });
  }
  const place = [text('city'), text('country')].filter(Boolean).join(', ');
  if (place) rows.push({ label: t('detail.place'), value: place });
  if (typeof read.durationWeeks === 'number') {
    rows.push({
      label: t('detail.duration'),
      value: t('detail.durationValue', { weeks: read.durationWeeks }),
    });
  }
  if (text('pay'))
    rows.push({ label: t('form.fields.pay'), value: t(`pay.${text('pay') as 'PAID'}`) });
  if (text('applicationChannel')) {
    rows.push({
      label: t('detail.channel'),
      value: t(`channels.${text('applicationChannel') as 'OTHER'}`),
    });
  }
  const steps = Array.isArray(read.processSteps)
    ? (read.processSteps as { title: string; description: string }[])
    : [];
  const questions = Array.isArray(read.interviewQuestions)
    ? (read.interviewQuestions as string[])
    : [];

  const facts =
    rows.length > 0 ? (
      <dl
        className={
          layout === 'split' ? 'grid gap-4' : 'grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2'
        }
      >
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-sm text-fg-muted">{row.label}</dt>
            <dd className="break-words text-base text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
    ) : null;
  const sections = (
    <>
      {steps.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-fg">{t('detail.process')}</h2>
          <ol className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-3 rounded-control border border-border p-3">
                <NumberChip>{index + 1}</NumberChip>
                <div className="min-w-0">
                  <p className="break-words text-base font-semibold text-fg">{step.title}</p>
                  <p className="mt-1 whitespace-pre-line break-words text-base text-fg-muted">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {questions.length > 0 && (
        // Mülakat tüyoları öğrencinin en çok aradığı kısımdır: zeminli kutu ve numaralı satırlarla öne çıkar.
        <section className="rounded-card bg-surface-strong p-4 sm:p-5">
          <h2 className="mb-3 text-lg font-semibold text-fg">{t('detail.questions')}</h2>
          <ol className="flex flex-col gap-3">
            {questions.map((question, index) => (
              <li key={index} className="flex gap-3">
                <NumberChip>{index + 1}</NumberChip>
                <span className="min-w-0 break-words text-base text-fg">{question}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {text('whatLearned') && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">{t('detail.learned')}</h2>
          <p className="whitespace-pre-line text-base leading-relaxed text-fg">
            {text('whatLearned')}
          </p>
        </section>
      )}
      {text('advice') && (
        <section className="border-l-4 border-primary pl-4">
          <h2 className="mb-2 text-lg font-semibold text-fg">{t('detail.advice')}</h2>
          <p className="whitespace-pre-line text-base leading-relaxed text-fg">{text('advice')}</p>
        </section>
      )}
    </>
  );
  if (layout === 'split')
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-10">
        <div className="flex min-w-0 max-w-[70ch] flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {sections}
        </div>
        {facts && (
          <aside
            aria-label={t('detail.facts')}
            className="rounded-card border border-border bg-surface p-5 max-lg:order-first lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1"
          >
            {facts}
          </aside>
        )}
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      {facts}
      {sections}
    </div>
  );
}

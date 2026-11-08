import { useTranslations } from 'next-intl';

import type { ExperienceDetail } from '@/contracts/experience';

type Content = ExperienceDetail['content'];
type Row = { label: string; value: string };

/** Deneyim içeriği (okuma). Moderasyon kuyruğu, detay ve liste aynı görünümü kullanır; yazar bilgisi içermez. */
export function ExperienceContent({ content }: { content: Content }) {
  const t = useTranslations('experiences');
  const read = content as Record<string, unknown>;
  const text = (key: string) => (typeof read[key] === 'string' ? (read[key] as string) : '');
  const rows: Row[] = [];
  if (text('organizationName'))
    rows.push({ label: t('detail.organization'), value: text('organizationName') });
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

  return (
    <div className="flex flex-col gap-6">
      {rows.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-sm text-fg-muted">{row.label}</dt>
              <dd className="break-words text-base text-fg">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {steps.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">{t('detail.process')}</h2>
          <ol className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <li key={index} className="rounded-control border border-border p-3">
                <p className="text-base font-semibold text-fg">
                  {index + 1}. {step.title}
                </p>
                <p className="mt-1 whitespace-pre-line text-base text-fg-muted">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {questions.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">{t('detail.questions')}</h2>
          <ul className="list-disc space-y-1 pl-5 text-base text-fg">
            {questions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
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
        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">{t('detail.advice')}</h2>
          <p className="whitespace-pre-line text-base leading-relaxed text-fg">{text('advice')}</p>
        </section>
      )}
    </div>
  );
}

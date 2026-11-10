'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { SkillGapResult } from '@/contracts/skill-gap';
import {
  Badge,
  BriefcaseIcon,
  Button,
  Field,
  IconChip,
  Select,
  buttonClasses,
} from '@/components/ui';
import { selectSkillGoal } from '@/server/actions/skill-gap';

function relatedQuery(label: string) {
  const query = label.trim().slice(0, 100).trim();
  return query.length === 1 ? `"${query}"` : query;
}

export function SkillGapPanel({
  data,
  titles,
}: {
  data: SkillGapResult;
  titles: { id: string; name: string }[];
}) {
  const t = useTranslations('skillGap');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [selected, setSelected] = useState(data.title?.id ?? '');
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  function save() {
    if (!selected) return;
    setError('');
    setMessage('');
    start(async () => {
      const result = await selectSkillGoal({ titleId: selected });
      if (!result.ok) {
        setError(errors(result.errorCode));
        return;
      }
      setMessage(t('saved'));
      router.refresh();
    });
  }
  const analysis = data.analysis;
  return (
    <section
      className="my-5 rounded-card border border-border bg-surface p-5 shadow-card"
      aria-labelledby="skill-gap-title"
    >
      <div className="flex items-start gap-3">
        <IconChip tone="accent">
          <BriefcaseIcon />
        </IconChip>
        <div>
          <h2 id="skill-gap-title" className="text-xl font-semibold">
            {t('title')}
          </h2>
          <p className="mt-1 text-fg-muted">{t('description')}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        <Field label={t('choose')}>
          {(control) => (
            <Select
              {...control}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">{t('placeholder')}</option>
              {titles.map((title) => (
                <option key={title.id} value={title.id}>
                  {title.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {selected ? (
          <Button onClick={save} loading={pending}>
            {t('save')}
          </Button>
        ) : (
          <Button disabled disabledReason={t('chooseHint')}>
            {t('save')}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
      {data.title && !analysis && (
        <p className="mt-5 rounded-control bg-bg p-4 text-fg-muted">{t('insufficient')}</p>
      )}
      {analysis && (
        <div className="mt-5 grid gap-4">
          <div>
            <p className="font-semibold">{t('cohort', { band: analysis.band })}</p>
            <p className="mt-1 text-fg-muted">{t('progress', { percent: analysis.progress })}</p>
            <div
              role="progressbar"
              aria-label={t('progress', { percent: analysis.progress })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={analysis.progress}
              className="mt-2 h-3 overflow-hidden rounded-full bg-bg"
            >
              <div
                className="h-full rounded-full bg-[image:var(--gradient-brand)]"
                style={{ width: `${analysis.progress}%` }}
              />
            </div>
          </div>
          <h3 className="text-lg font-semibold">{t('missing')}</h3>
          {analysis.missing.length ? (
            <ul className="grid gap-3">
              {analysis.missing.map((skill) => (
                <li key={skill.id} className="rounded-control border border-border bg-bg p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 max-w-full font-semibold [overflow-wrap:anywhere]">
                      {skill.label}
                    </span>
                    <Badge tone="category">{t('percent', { percent: skill.percent })}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      className={buttonClasses({ variant: 'secondary' })}
                      href={`/mentorlar?skill=${encodeURIComponent(skill.label)}`}
                    >
                      {t('mentor')}
                    </Link>
                    <Link
                      className={buttonClasses({ variant: 'ghost' })}
                      href={`/sss?q=${encodeURIComponent(relatedQuery(skill.label))}`}
                    >
                      {t('faq')}
                    </Link>
                    <Link
                      className={buttonClasses({ variant: 'ghost' })}
                      href={`/deneyimler?q=${encodeURIComponent(relatedQuery(skill.label))}`}
                    >
                      {t('experience')}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('complete')}</p>
          )}
          <p className="text-fg-muted">{t('privacy')}</p>
        </div>
      )}
    </section>
  );
}

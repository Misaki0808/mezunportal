'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { MyAward } from '@/contracts/year-alumni';
import {
  BadgeCheckIcon,
  Button,
  Card,
  EmptyState,
  IconChip,
  PageHeader,
  Switch,
  buttonClasses,
} from '@/components/ui';
import { setAwardPublication } from '@/server/actions/year-alumni';

function AwardCard({ initial }: { initial: MyAward }) {
  const t = useTranslations('yearAlumni');
  const errors = useTranslations('errors.codes');
  const [award, setAward] = useState(initial);
  const [publish, setPublish] = useState(initial.isPublic);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      setMessage('');
      const result = await setAwardPublication({ awardId: award.id, public: publish });
      if (result.ok) {
        setAward(result.data);
        setMessage(t('saved'));
      } else setMessage(errors(result.errorCode));
    });
  }
  async function copy(share = false) {
    try {
      if (!award.verificationUrl) return;
      await navigator.clipboard.writeText(
        share
          ? t('shareText', {
              university: award.university,
              department: award.department,
              year: award.year,
              url: award.verificationUrl,
            })
          : award.verificationUrl,
      );
      setMessage(t('copied'));
    } catch {
      setMessage(t('invalid'));
    }
  }
  return (
    <Card className="relative overflow-hidden p-6">
      <div
        aria-hidden="true"
        className="absolute -right-12 -top-12 size-40 rounded-full bg-[image:var(--gradient-brand)] opacity-20 blur-2xl motion-safe:animate-pulse"
      />
      <div className="relative space-y-5">
        <IconChip tone="primary">
          <BadgeCheckIcon />
        </IconChip>
        <div>
          <h2 className="text-2xl font-semibold">{t('awardName')}</h2>
          <p>
            {t('awardYear', { year: award.year })} · {award.department}
          </p>
          <p className="text-fg-muted">{award.university}</p>
        </div>
        <Switch
          checked={publish}
          onChange={(event) => setPublish(event.target.checked)}
          label={t('publication')}
          description={t('publicationHelp')}
        />
        <Button
          {...(pending
            ? { disabled: true as const, disabledReason: t('saving') }
            : { disabled: false as const })}
          onClick={save}
        >
          {pending ? t('saving') : t('save')}
        </Button>
        {award.linkedinUrl && award.verificationUrl ? (
          <div className="flex flex-wrap gap-2">
            <a
              className={buttonClasses({ variant: 'secondary' })}
              href={award.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('linkedin')}
            </a>
            <Button variant="secondary" onClick={() => copy()}>
              {t('copy')}
            </Button>
            <Button variant="secondary" onClick={() => copy(true)}>
              {t('share')}
            </Button>
          </div>
        ) : (
          <p className="text-fg-muted">{t('enablePublic')}</p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </Card>
  );
}
export function MyAwards({ awards }: { awards: MyAward[] }) {
  const t = useTranslations('yearAlumni');
  return (
    <main className="mx-auto max-w-2xl space-y-7 px-5 py-10">
      <PageHeader eyebrow={t('awardName')} title={t('title')} description={t('intro')} />
      {awards.length ? (
        awards.map((award) => <AwardCard key={award.id} initial={award} />)
      ) : (
        <EmptyState title={t('empty')} />
      )}
    </main>
  );
}

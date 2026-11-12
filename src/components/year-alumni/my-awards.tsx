'use client';
import { safeClientAction } from '@/lib/safe-client-action';
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
  useToast,
} from '@/components/ui';
import { setAwardPublication } from '@/server/actions/year-alumni';

function AwardCard({ initial }: { initial: MyAward }) {
  const t = useTranslations('yearAlumni');
  const errors = useTranslations('errors.codes');
  const [award, setAward] = useState(initial);
  const [publish, setPublish] = useState(initial.isPublic);
  const [message, setMessage] = useState('');
  const toast = useToast();
  const [pending, start] = useTransition();
  function save() {
    start(async () => {
      setMessage('');
      const result = await safeClientAction(() =>
        setAwardPublication({ awardId: award.id, public: publish }),
      );
      if (result.ok) {
        setAward(result.data);
        toast.show({ message: t('saved'), tone: 'success' });
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
      toast.show({ message: t('copied'), tone: 'success' });
    } catch {
      setMessage(t('invalid'));
    }
  }
  return (
    <Card className="relative overflow-hidden p-6">
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
        <Button loading={pending} onClick={save}>
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
        {message && <p role="alert">{message}</p>}
      </div>
    </Card>
  );
}
export function MyAwards({ awards }: { awards: MyAward[] }) {
  const t = useTranslations('yearAlumni');
  return (
    <div className="mx-auto max-w-2xl space-y-7 px-5 py-10">
      <PageHeader eyebrow={t('awardName')} title={t('title')} description={t('intro')} />
      {awards.length ? (
        awards.map((award) => <AwardCard key={award.id} initial={award} />)
      ) : (
        <EmptyState title={t('empty')} />
      )}
    </div>
  );
}

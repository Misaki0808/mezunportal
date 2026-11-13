'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Checkbox, PageHeader, Select, Switch } from '@/components/ui';
import { recordConsents } from '@/server/actions/privacy';
import { setSeekerSettings } from '@/server/actions/job-seekers';
import type { SeekerSettings, SeekerTermSeason } from '@/contracts/job-seekers';
import { SeekerCardView } from './card';

export function SeekerSettingsScreen({ initial }: { initial: SeekerSettings }) {
  const t = useTranslations('seekers');
  const errors = useTranslations('errors.codes');
  const [data, setData] = useState(initial);
  const [visible, setVisible] = useState(initial.seekingInternship);
  const [agree, setAgree] = useState(initial.consent.granted);
  const [year, setYear] = useState(initial.termYear?.toString() ?? '');
  const [season, setSeason] = useState<SeekerTermSeason | ''>(initial.termSeason ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  function save() {
    setError('');
    setSaved(false);
    if (visible && !agree) {
      setError(t('consentRequired'));
      return;
    }
    if (!!year !== !!season) {
      setError(t('termPair'));
      return;
    }
    start(async () => {
      try {
        if (visible && !data.consent.granted) {
          const consent = await recordConsents({
            decisions: [
              {
                documentType: 'JOB_SEEKER_VISIBILITY',
                version: data.consent.currentVersion,
                granted: true,
              },
            ],
          });
          if (!consent.ok) {
            setError(errors(consent.errorCode));
            return;
          }
        }
        const result = await setSeekerSettings({
          seekingInternship: visible,
          termYear: year ? Number(year) : null,
          termSeason: season || null,
        });
        if (!result.ok) {
          setError(errors(result.errorCode));
          return;
        }
        if (!visible && data.consent.granted) {
          const revoked = await recordConsents({
            decisions: [
              {
                documentType: 'JOB_SEEKER_VISIBILITY',
                version: data.consent.currentVersion,
                granted: false,
              },
            ],
          });
          if (!revoked.ok) {
            setData(result.data);
            setError(errors(revoked.errorCode));
            return;
          }
        }
        setData(
          visible
            ? result.data
            : { ...result.data, consent: { ...result.data.consent, granted: false } },
        );
        setAgree(visible);
        setSaved(true);
      } catch {
        setError(errors('SERVER_UNEXPECTED'));
      }
    });
  }
  return (
    <div className="mx-auto max-w-2xl space-y-7 px-5 py-10 pb-36">
      <Link
        className="press-control inline-flex min-h-11 items-center font-semibold text-primary"
        href="/hesap"
      >
        ← {t('backAccount')}
      </Link>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('settingsTitle')}
        description={t('settingsDescription')}
      />
      <div className="rounded-card border border-border p-5">
        <Switch
          label={t('visibility')}
          description={t('visibilityHint')}
          checked={visible}
          disabled={pending}
          onChange={(e) => {
            setVisible(e.target.checked);
            setSaved(false);
          }}
        />
      </div>
      {visible && (
        <div className="space-y-4 rounded-card border border-border p-5">
          <h2 className="font-semibold">{t('consentTitle')}</h2>
          <p className="text-fg-muted">{t('consentText')}</p>
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-primary underline"
            href="/hukuki/staj-arayan-gorunurlugu"
          >
            {t('consentLink')}
          </Link>
          <Checkbox
            label={t('consentAgree')}
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
          />
        </div>
      )}
      <div className="space-y-3 rounded-card border border-border p-5">
        <h2 className="font-semibold">{t('termTitle')}</h2>
        <p className="text-sm text-fg-muted">{t('termHint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span>{t('year')}</span>
            <Select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">{t('anyYear')}</option>
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span>{t('season')}</span>
            <Select
              value={season}
              onChange={(e) => setSeason(e.target.value as SeekerTermSeason | '')}
            >
              <option value="">{t('anySeason')}</option>
              {(['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`seasons.${s}`)}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
      <section aria-labelledby="preview-title" className="space-y-3">
        <h2 id="preview-title" className="text-xl font-semibold">
          {t('previewTitle')}
        </h2>
        <p className="text-fg-muted">{t('previewDescription')}</p>
        {data.preview ? (
          <SeekerCardView card={data.preview} />
        ) : (
          <p>
            {t('previewEmpty')}{' '}
            <Link className="text-primary underline" href="/profil">
              {t('editProfile')}
            </Link>
          </p>
        )}
        <p className="text-sm text-fg-muted">{t('viewCount', { count: data.viewCount })}</p>
      </section>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-success">
          {t('saved')}
        </p>
      )}
      <div className="sticky bottom-20 rounded-control bg-bg py-3 lg:static">
        <Button className="w-full" loading={pending} onClick={save}>
          {t('save')}
        </Button>
      </div>
    </div>
  );
}

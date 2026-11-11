'use client';
import { safeClientAction } from '@/lib/safe-client-action';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  awardCycleInputSchema,
  configureAwardCycleSchema,
  recalculateAwardCycleSchema,
  selectYearAlumnusSchema,
  type AwardCycleView,
} from '@/contracts/year-alumni';
import { Button, Card, Field, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import {
  configureAwardCycle,
  listAwardCandidates,
  recalculateAwardCycle,
  selectYearAlumnus,
} from '@/server/actions/year-alumni';

export function AwardAdmin({ departments }: { departments: { id: string; name: string }[] }) {
  const t = useTranslations('yearAlumni');
  const errors = useTranslations('errors.codes');
  const pointLabels = useTranslations('points.actions');
  const disabled = (condition: boolean, reason: string) =>
    condition ? { disabled: true as const, disabledReason: reason } : { disabled: false as const };
  const [departmentId, setDepartment] = useState(departments[0]?.id ?? '');
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [ceremonyDate, setCeremony] = useState('');
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [cycle, setCycle] = useState<AwardCycleView | null>(null);
  const [missed, setMissed] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const input = { departmentId, year };
  function load() {
    start(async () => {
      setMessage('');
      if (!awardCycleInputSchema.safeParse(input).success) {
        setMessage(t('invalid'));
        return;
      }
      const result = await safeClientAction(() => listAwardCandidates(input));
      setMissed(!result.ok && result.errorCode === 'AWARD_FREEZE_MISSED');
      if (result.ok) setCycle(result.data);
      else {
        setCycle(null);
        setMessage(
          result.errorCode === 'RESOURCE_NOT_FOUND' ? t('noCycle') : errors(result.errorCode),
        );
      }
    });
  }
  function configure() {
    start(async () => {
      setMessage('');
      const parsed = configureAwardCycleSchema.safeParse({ ...input, ceremonyDate });
      if (!parsed.success) {
        setMessage(t('invalid'));
        return;
      }
      const result = await safeClientAction(() => configureAwardCycle(parsed.data));
      if (result.ok) {
        setCycle(result.data);
        setMissed(false);
        setMessage(t('saved'));
      } else setMessage(errors(result.errorCode));
    });
  }
  function recalculate() {
    start(async () => {
      setMessage('');
      const parsed = recalculateAwardCycleSchema.safeParse({ ...input, reason });
      if (!parsed.success) {
        setMessage(t('invalid'));
        return;
      }
      const result = await safeClientAction(() => recalculateAwardCycle(parsed.data));
      if (result.ok) {
        setCycle(result.data);
        setReason('');
        setMissed(false);
        setMessage(t('saved'));
      } else setMessage(errors(result.errorCode));
    });
  }
  function choose() {
    start(async () => {
      if (!selected) return;
      const parsed = selectYearAlumnusSchema.safeParse({ ...input, userId: selected, reason });
      if (!parsed.success) {
        setMessage(t('invalid'));
        return;
      }
      const result = await safeClientAction(() => selectYearAlumnus(parsed.data));
      if (!result.ok) {
        setMessage(errors(result.errorCode));
        return;
      }
      setSelected(null);
      setReason('');
      setMessage(t('selected'));
      const refreshed = await safeClientAction(() => listAwardCandidates(input));
      if (refreshed.ok) setCycle(refreshed.data);
    });
  }
  return (
    <div className="mx-auto max-w-4xl space-y-7 px-5 py-10">
      <PageHeader title={t('adminTitle')} description={t('adminIntro')} />
      <Card className="space-y-4 p-5">
        <Field label={t('selectDepartment')}>
          {(props) => (
            <Select
              {...props}
              value={departmentId}
              onChange={(e) => {
                setDepartment(e.target.value);
                setCycle(null);
                setMissed(false);
              }}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('year')}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setCycle(null);
                setMissed(false);
              }}
            />
          )}
        </Field>
        <Button
          {...disabled(pending || !departmentId, pending ? t('saving') : t('noDepartments'))}
          onClick={load}
        >
          {pending ? t('saving') : t('load')}
        </Button>
        <Field label={t('ceremony')} hint={t('freezeInfo')}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={ceremonyDate}
              onChange={(e) => setCeremony(e.target.value)}
            />
          )}
        </Field>
        <Button
          variant="secondary"
          {...disabled(pending || !departmentId, pending ? t('saving') : t('noDepartments'))}
          onClick={configure}
        >
          {t('configure')}
        </Button>
      </Card>
      {message && (
        <p role="status" className="text-fg">
          {message}
        </p>
      )}
      {missed && (
        <Card className="space-y-3 p-5">
          <Field label={t('recalculateReason')}>
            {(props) => (
              <Textarea {...props} value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
          <Button variant="secondary" {...disabled(pending, t('saving'))} onClick={recalculate}>
            {t('recalculate')}
          </Button>
        </Card>
      )}
      {cycle && (
        <>
          <Card className="space-y-3 p-5">
            <p className="font-semibold">{cycle.frozenAt ? t('frozen') : t('live')}</p>
            {cycle.selectedNeedsReview && (
              <p role="alert" className="text-danger">
                {t('awardNeedsReview')}
              </p>
            )}
            <p>{t('excluded', { count: cycle.excludedForSuspicion })}</p>
            {cycle.frozenAt && (
              <>
                <Field label={t('recalculateReason')}>
                  {(props) => (
                    <Textarea
                      {...props}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  )}
                </Field>
                <Button
                  variant="secondary"
                  {...disabled(pending, t('saving'))}
                  onClick={recalculate}
                >
                  {t('recalculate')}
                </Button>
              </>
            )}
          </Card>
          <ul className="space-y-3">
            {cycle.candidates.map((candidate) => (
              <li key={candidate.userId}>
                <Card className="space-y-2 p-5">
                  <h2 className="text-lg font-semibold">{candidate.name}</h2>
                  <p>
                    {t('points', { count: candidate.points })} ·{' '}
                    {t('experiences', { count: candidate.experienceCount })} ·{' '}
                    {t('meetings', { count: candidate.meetingCount })}
                  </p>
                  <ul>
                    {candidate.breakdown.map((item) => (
                      <li key={item.action}>
                        {pointLabels(item.action)}: {item.points}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="secondary"
                    {...disabled(
                      pending || !cycle.frozenAt || !!cycle.selectedUserId,
                      pending
                        ? t('saving')
                        : cycle.selectedUserId
                          ? t('selected')
                          : t('freezeInfo'),
                    )}
                    onClick={() => {
                      setReason('');
                      setSelected(candidate.userId);
                    }}
                  >
                    {t('choose')}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
          {cycle.candidates.length === 0 && <p>{t('noCandidates')}</p>}
        </>
      )}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={t('confirm')}
        description={t('confirmText')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              {t('cancel')}
            </Button>
            <Button {...disabled(pending, t('saving'))} onClick={choose}>
              {pending ? t('saving') : t('confirm')}
            </Button>
          </>
        }
      >
        <Field label={t('reason')} error={message || undefined}>
          {(props) => (
            <Textarea {...props} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
      </Modal>
    </div>
  );
}

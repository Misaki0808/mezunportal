'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  monthlySelectionSchema,
  reviewStorySchema,
  type ModerationStory,
} from '@/contracts/alumni-story';
import { istanbulMonth } from '@/server/rules/alumniStory';
import { Button, Card, Field, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import {
  listStoryModeration,
  reviewStory,
  selectMonthlyAlumnus,
} from '@/server/actions/alumni-story';

type Intent = { mode: 'PUBLISH' | 'REJECT' | 'SELECT'; storyId: string };
export function StoryAdmin({ departments }: { departments: { id: string; name: string }[] }) {
  const t = useTranslations('alumniStory'),
    errors = useTranslations('errors.codes');
  const [departmentId, setDepartment] = useState(departments[0]?.id ?? ''),
    [rows, setRows] = useState<ModerationStory[] | null>(null),
    [month, setMonth] = useState(istanbulMonth(new Date())),
    [reason, setReason] = useState(''),
    [intent, setIntent] = useState<Intent | null>(null),
    [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const disabled = (value: boolean, why: string) =>
    value ? { disabled: true as const, disabledReason: why } : { disabled: false as const };
  function load() {
    start(async () => {
      setMessage('');
      const result = await listStoryModeration({ departmentId });
      if (result.ok) setRows(result.data);
      else setMessage(errors(result.errorCode));
    });
  }
  function decide() {
    if (!intent) return;
    start(async () => {
      setMessage('');
      if (intent.mode === 'SELECT') {
        const parsed = monthlySelectionSchema.safeParse({
          departmentId,
          storyId: intent.storyId,
          month,
          reason,
        });
        if (!parsed.success) {
          setMessage(t('invalid'));
          return;
        }
        const result = await selectMonthlyAlumnus(parsed.data);
        if (!result.ok) {
          setMessage(errors(result.errorCode));
          return;
        }
        setMessage(t('chooseSuccess'));
      } else {
        const parsed = reviewStorySchema.safeParse({
          storyId: intent.storyId,
          decision: intent.mode,
          reason: reason || undefined,
        });
        if (!parsed.success) {
          setMessage(t('invalid'));
          return;
        }
        const result = await reviewStory(parsed.data);
        if (!result.ok) {
          setMessage(errors(result.errorCode));
          return;
        }
        setMessage(t('reviewSuccess'));
      }
      setIntent(null);
      setReason('');
      const result = await listStoryModeration({ departmentId });
      if (result.ok) setRows(result.data);
    });
  }
  function open(mode: Intent['mode'], storyId: string) {
    setReason('');
    setMessage('');
    setIntent({ mode, storyId });
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-10">
      <PageHeader title={t('adminTitle')} description={t('adminIntro')} />
      <Card className="space-y-4 p-5">
        <Field label={t('selectDepartment')}>
          {(props) => (
            <Select
              {...props}
              value={departmentId}
              onChange={(e) => {
                setDepartment(e.target.value);
                setRows(null);
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
        <Button
          {...disabled(pending || !departmentId, pending ? t('pending') : t('noDepartments'))}
          onClick={load}
        >
          {t('load')}
        </Button>
      </Card>
      {message && <p role="status">{message}</p>}
      {rows && (
        <>
          <ul className="space-y-4">
            {rows.map((story) => (
              <li key={story.id}>
                <Card className="space-y-3 p-5">
                  <h2 className="text-lg font-semibold">{story.name}</h2>
                  <p>
                    {t(`statuses.${story.status}`)} ·{' '}
                    {story.points === null ? t('noPoints') : t('points', { count: story.points })}
                  </p>
                  {story.suspicious && <p className="text-danger">{t('suspicious')}</p>}
                  {!story.consent && <p>{t('noConsent')}</p>}
                  <p className="whitespace-pre-wrap break-words">{story.body}</p>
                  <div className="flex flex-wrap gap-2">
                    {story.status === 'PENDING' && (
                      <>
                        <Button
                          variant="secondary"
                          {...disabled(
                            pending || !story.consent,
                            pending ? t('pending') : t('noConsent'),
                          )}
                          onClick={() => open('PUBLISH', story.id)}
                        >
                          {t('review')}
                        </Button>
                        <Button
                          variant="secondary"
                          {...disabled(pending, t('pending'))}
                          onClick={() => open('REJECT', story.id)}
                        >
                          {t('reject')}
                        </Button>
                      </>
                    )}
                    {story.status === 'PUBLISHED' && (
                      <Button
                        {...disabled(
                          pending || !story.consent || story.suspicious,
                          pending
                            ? t('pending')
                            : story.suspicious
                              ? t('suspicious')
                              : t('noConsent'),
                        )}
                        onClick={() => open('SELECT', story.id)}
                      >
                        {t('choose')}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          {!rows.length && <p>{t('queueEmpty')}</p>}
        </>
      )}
      <Modal
        open={!!intent}
        onClose={() => setIntent(null)}
        title={t('confirm')}
        description={t('confirmText')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIntent(null)}>
              {t('cancel')}
            </Button>
            <Button {...disabled(pending, t('pending'))} onClick={decide}>
              {pending ? t('pending') : t('confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {intent?.mode === 'SELECT' && (
            <Field label={t('month')}>
              {(props) => (
                <Input
                  {...props}
                  type="month"
                  min={istanbulMonth(new Date())}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              )}
            </Field>
          )}
          {intent?.mode !== 'PUBLISH' && (
            <Field label={t('reason')} error={message || undefined}>
              {(props) => (
                <Textarea {...props} value={reason} onChange={(e) => setReason(e.target.value)} />
              )}
            </Field>
          )}
          {intent?.mode === 'PUBLISH' && message && <p role="alert">{message}</p>}
        </div>
      </Modal>
    </div>
  );
}

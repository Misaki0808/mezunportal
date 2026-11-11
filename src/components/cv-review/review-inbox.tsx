'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, Field, Input, Switch, Textarea } from '@/components/ui';
import {
  answerCvReviewRequestSchema,
  cvReviewSettingsSchema,
  cvReviewFileHref,
  type CvReviewRequestPage,
  type CvReviewRequestView,
  type CvReviewSettings,
} from '@/contracts/cv-review-request';
import {
  answerCvReviewRequest,
  listCvReviewRequests,
  markCvReviewHelpful,
  saveCvReviewSettings,
} from '@/server/actions/cv-review-request';

type Props = {
  sent: CvReviewRequestPage | null;
  received: CvReviewRequestPage | null;
  initialSettings: CvReviewSettings | null;
};
export function ReviewInbox({ sent, received, initialSettings }: Props) {
  const t = useTranslations('cvReview'),
    errors = useTranslations('errors.codes');
  const [student, setStudent] = useState(sent),
    [mentor, setMentor] = useState(received),
    [settings, setSettings] = useState(initialSettings),
    [pending, setPending] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const lock = useRef(false);
  async function run(key: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(key);
    setError('');
    setMessage('');
    try {
      await action();
    } catch {
      setError(errors('SERVER_UNEXPECTED'));
    } finally {
      lock.current = false;
      setPending('');
    }
  }
  function update(item: CvReviewRequestView) {
    const setter = item.role === 'MENTOR' ? setMentor : setStudent;
    setter((prev) =>
      prev ? { ...prev, items: prev.items.map((row) => (row.id === item.id ? item : row)) } : prev,
    );
  }
  async function answer(row: CvReviewRequestView, comment: string) {
    const p = answerCvReviewRequestSchema.safeParse({ requestId: row.id, comment });
    if (!p.success) {
      setError(t('required'));
      return;
    }
    await run(row.id, async () => {
      const r = await answerCvReviewRequest(p.data);
      if (r.ok) {
        update(r.data);
        setMessage(t('answered'));
      } else setError(errors(r.errorCode));
    });
  }
  async function helpful(row: CvReviewRequestView) {
    await run(row.id, async () => {
      const r = await markCvReviewHelpful({ requestId: row.id });
      if (r.ok) {
        update(r.data);
        setMessage(t('marked'));
      } else setError(errors(r.errorCode));
    });
  }
  async function more(role: 'STUDENT' | 'MENTOR', cursor: string) {
    await run(`more-${role}`, async () => {
      const r = await listCvReviewRequests({ role, cursor });
      if (r.ok) {
        const setter = role === 'MENTOR' ? setMentor : setStudent;
        setter((prev) => (prev ? { ...r.data, items: [...prev.items, ...r.data.items] } : r.data));
      } else setError(errors(r.errorCode));
    });
  }
  async function save() {
    const p = cvReviewSettingsSchema.safeParse(settings);
    if (!p.success) {
      setError(t('required'));
      return;
    }
    await run('settings', async () => {
      const r = await saveCvReviewSettings(p.data);
      if (r.ok) {
        setSettings(r.data);
        setMessage(t('saved'));
      } else setError(errors(r.errorCode));
    });
  }
  function section(page: CvReviewRequestPage | null, role: 'STUDENT' | 'MENTOR') {
    if (!page) return null;
    return (
      <section className="mt-8">
        <h2 className="text-xl font-semibold">
          {t(role === 'STUDENT' ? 'studentHeading' : 'mentorHeading')}
        </h2>
        {page.items.length === 0 ? (
          <div className="mt-4 rounded-card border border-border p-5">
            <p>{t(role === 'STUDENT' ? 'emptyStudent' : 'emptyMentor')}</p>
            {role === 'STUDENT' && (
              <Link
                className="mt-2 inline-flex min-h-11 items-center text-primary"
                href="/mentorlar"
              >
                {t('findMentor')} →
              </Link>
            )}
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {page.items.map((row) => (
              <li key={row.id}>
                <ReviewCard
                  row={row}
                  pending={pending === row.id}
                  onAnswer={answer}
                  onHelpful={helpful}
                />
              </li>
            ))}
          </ul>
        )}
        {page.nextCursor && (
          <Button
            variant="secondary"
            className="mt-4"
            loading={pending === `more-${role}`}
            onClick={() => void more(role, page.nextCursor!)}
          >
            {t('more')}
          </Button>
        )}
      </section>
    );
  }
  return (
    <div className="mx-auto max-w-2xl px-5 py-10 pb-28">
      <Link className="inline-flex min-h-11 items-center text-primary" href="/hesap">
        ← {t('back')}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">{t('title')}</h1>
      {error && (
        <p role="alert" className="mt-4 text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-primary">
          {message}
        </p>
      )}
      {section(student, 'STUDENT')}
      {section(mentor, 'MENTOR')}
      {settings && (
        <section className="mt-8 rounded-card border border-border p-5">
          <h2 className="text-xl font-semibold">{t('settings')}</h2>
          <Switch
            label={t('enabled')}
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          <Field label={t('limit')}>
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={settings.monthlyLimit}
                onChange={(e) => setSettings({ ...settings, monthlyLimit: Number(e.target.value) })}
              />
            )}
          </Field>
          <Button
            className="mt-4"
            variant="secondary"
            loading={pending === 'settings'}
            onClick={() => void save()}
          >
            {pending === 'settings' ? t('saving') : t('save')}
          </Button>
        </section>
      )}
    </div>
  );
}
function ReviewCard({
  row,
  pending,
  onAnswer,
  onHelpful,
}: {
  row: CvReviewRequestView;
  pending: boolean;
  onAnswer: (row: CvReviewRequestView, comment: string) => Promise<void>;
  onHelpful: (row: CvReviewRequestView) => Promise<void>;
}) {
  const t = useTranslations('cvReview');
  const [comment, setComment] = useState('');
  return (
    <article className="rounded-card border border-border p-5">
      <h3 className="text-lg font-semibold">{row.counterpart.displayName}</h3>
      <p className="mt-1 text-base text-fg-muted">{t(`status.${row.status}`)}</p>
      <p className="mt-4 whitespace-pre-wrap break-words">{row.note}</p>
      {row.actions.canViewCv && (
        <a
          className="mt-3 inline-flex min-h-11 items-center text-primary"
          href={cvReviewFileHref(row.id)}
          target="_blank"
          rel="noreferrer"
        >
          {t('viewCv')} ↗
        </a>
      )}
      {row.comment && <p className="mt-4 whitespace-pre-wrap break-words">{row.comment}</p>}
      {row.actions.canAnswer && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onAnswer(row, comment);
          }}
        >
          <Field label={t('comment')}>
            {(control) => (
              <Textarea
                {...control}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={3000}
                rows={4}
              />
            )}
          </Field>
          <Button type="submit" loading={pending} className="mt-3">
            {pending ? t('sending') : t('answer')}
          </Button>
        </form>
      )}
      {row.actions.canMarkHelpful && (
        <Button
          className="mt-4"
          variant="secondary"
          loading={pending}
          onClick={() => void onHelpful(row)}
        >
          {t('helpful')}
        </Button>
      )}
      {row.helpfulAt && <p className="mt-3 text-primary">{t('marked')}</p>}
    </article>
  );
}

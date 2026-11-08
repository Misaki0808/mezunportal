'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import {
  JOB_POSTING_MAX_DAYS,
  jobPostingContentSchema,
  type JobPostingFormContext,
  type JobPostingIdInput,
  type MyJobPostingView,
  type SaveJobPostingDraftInput,
  type SubmitJobPostingOutput,
} from '@/contracts/job-postings';
import type { ActionResult } from '@/contracts/result';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { addDays, istanbulDay } from './model';

type Props = {
  context: JobPostingFormContext;
  initial?: MyJobPostingView;
  save: (input: SaveJobPostingDraftInput) => Promise<ActionResult<MyJobPostingView>>;
  submit: (input: JobPostingIdInput) => Promise<ActionResult<SubmitJobPostingOutput>>;
};
export function PostingEditor({ context, initial, save, submit }: Props) {
  const t = useTranslations('jobs');
  const errors = useTranslations('errors.codes');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, start] = useTransition();
  const [id, setId] = useState(initial?.id);
  const [departmentId, setDepartment] = useState(
    initial?.departmentId ?? context.authorDepartments[0]?.id ?? '',
  );
  const [kind, setKind] = useState<'INTERNSHIP' | 'JOB'>(initial?.kind ?? 'INTERNSHIP');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [organization, setOrganization] = useState(initial?.organizationName ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [remote, setRemote] = useState(initial?.isRemote ?? false);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [deadline, setDeadline] = useState(initial?.deadlineOn ?? '');
  const [method, setMethod] = useState<'URL' | 'CONTACT_REQUEST'>(initial?.applyMethod ?? 'URL');
  const [url, setUrl] = useState(initial?.applyUrl ?? '');
  const [targets, setTargets] = useState<string[]>(
    initial?.targetDepartments.map((d) => d.id) ?? [],
  );
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const summary = useRef<HTMLDivElement>(null);
  const today = istanbulDay();
  const max = addDays(today, JOB_POSTING_MAX_DAYS);
  const content = {
    kind,
    title,
    organizationName: organization,
    location: location || null,
    isRemote: remote,
    description,
    deadlineOn: deadline || null,
    applyMethod: method,
    applyUrl: method === 'URL' ? url : null,
    targetDepartmentIds: targets,
  };
  function showError(message: string, fields: string[] = []) {
    setError(message);
    setInvalid(new Set(fields));
    requestAnimationFrame(() => summary.current?.focus());
  }
  function saveDraft(thenSubmit: boolean) {
    setError('');
    setNotice('');
    if (!departmentId) {
      showError(t('formSummary'), ['departmentId']);
      return;
    }
    if (deadline && (deadline < today || deadline > max)) {
      setStep(1);
      showError(t('invalidDate'), ['deadlineOn']);
      return;
    }
    if (thenSubmit) {
      const parsed = jobPostingContentSchema.safeParse(content);
      if (!parsed.success) {
        const fields = parsed.error.issues.map((issue) => String(issue.path[0]));
        setStep(fields.some((x) => ['title', 'organizationName', 'kind'].includes(x)) ? 0 : 1);
        showError(t('formSummary'), fields);
        return;
      }
    }
    start(async () => {
      const result = await save({ ...(id ? { postingId: id } : {}), departmentId, content });
      if (!result.ok) {
        showError(errors(result.errorCode));
        return;
      }
      setId(result.data.id);
      if (!thenSubmit) {
        setNotice(t('saved'));
        return;
      }
      const sent = await submit({ postingId: result.data.id });
      if (!sent.ok) {
        showError(errors(sent.errorCode));
        return;
      }
      router.push('/ilanlarim');
      router.refresh();
    });
  }
  const bad = (field: string) => (invalid.has(field) ? t('requiredError') : undefined);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/ilanlar"
        className="press-control inline-flex min-h-11 items-center font-semibold text-primary"
      >
        ← {t('back')}
      </Link>
      <header className="mb-7">
        <p className="font-semibold text-accent-strong">{t('eyebrow')}</p>
        <h1 className="mt-2 text-3xl font-bold text-fg">{t('newTitle')}</h1>
        <p className="mt-2 text-fg-muted">{t('newSubtitle')}</p>
      </header>
      <div className="mb-5">
        <p className="text-sm font-semibold text-fg-muted">
          {t('step', { current: step + 1, total: 3 })}
        </p>
        <div className="mt-2 flex gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-surface-strong'}`}
            />
          ))}
        </div>
      </div>
      {error && (
        <div
          ref={summary}
          tabIndex={-1}
          role="alert"
          className="mb-5 rounded-control border border-danger bg-surface p-4 font-medium text-danger"
        >
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="mb-5 rounded-control bg-primary-soft p-4 text-on-primary-soft">
          {notice}
        </p>
      )}
      <section className="space-y-5 rounded-3xl border border-border bg-surface p-5 sm:p-7">
        <h2 className="text-xl font-bold">
          {t(step === 0 ? 'formBasics' : step === 1 ? 'formDetails' : 'formPreview')}
        </h2>
        {step === 0 && (
          <>
            <Field label={t('kind')} required>
              {(p) => (
                <Select
                  {...p}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  <option value="INTERNSHIP">{t('INTERNSHIP')}</option>
                  <option value="JOB">{t('JOB')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('titleLabel')} required error={bad('title')}>
              {(p) => (
                <Input
                  {...p}
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('organization')} required error={bad('organizationName')}>
              {(p) => (
                <Input
                  {...p}
                  value={organization}
                  maxLength={120}
                  onChange={(e) => setOrganization(e.target.value)}
                  autoComplete="organization"
                />
              )}
            </Field>
            <Field label={t('authorDepartment')} required error={bad('departmentId')}>
              {(p) => (
                <Select {...p} value={departmentId} onChange={(e) => setDepartment(e.target.value)}>
                  {context.authorDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}
        {step === 1 && (
          <>
            <Field label={t('descriptionLabel')} required error={bad('description')}>
              {(p) => (
                <Textarea
                  {...p}
                  value={description}
                  maxLength={3000}
                  rows={6}
                  onChange={(e) => setDescription(e.target.value)}
                />
              )}
            </Field>
            <Field label={t('locationLabel')} error={bad('location')}>
              {(p) => (
                <Input
                  {...p}
                  value={location}
                  maxLength={100}
                  onChange={(e) => setLocation(e.target.value)}
                />
              )}
            </Field>
            <label className="flex min-h-11 items-center gap-3">
              <input
                className="size-5 accent-primary"
                type="checkbox"
                checked={remote}
                onChange={(e) => setRemote(e.target.checked)}
              />
              {t('remoteQuestion')}
            </label>
            <Field
              label={t('deadline')}
              hint={t('deadlineHint')}
              required
              error={bad('deadlineOn')}
            >
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  min={today}
                  max={max}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              )}
            </Field>
            <fieldset>
              <legend className="font-semibold">{t('targetDepartments')}</legend>
              {bad('targetDepartmentIds') && (
                <p className="text-danger">{bad('targetDepartmentIds')}</p>
              )}
              <div className="mt-2 grid gap-2">
                {context.targetDepartments.map((d) => (
                  <label
                    key={d.id}
                    className="flex min-h-11 items-center gap-3 rounded-control border border-border px-3"
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={targets.includes(d.id)}
                      onChange={(e) =>
                        setTargets((old) =>
                          e.target.checked
                            ? [...old, d.id].slice(0, context.limits.maxTargets)
                            : old.filter((x) => x !== d.id),
                        )
                      }
                    />
                    <span>
                      {d.name} · {d.facultyName}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label={t('applyMethod')} required>
              {(p) => (
                <Select
                  {...p}
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                >
                  <option value="URL">{t('urlMethod')}</option>
                  <option value="CONTACT_REQUEST">{t('contactMethod')}</option>
                </Select>
              )}
            </Field>
            {method === 'URL' && (
              <Field label={t('applyUrl')} required error={bad('applyUrl')}>
                {(p) => (
                  <Input
                    {...p}
                    type="url"
                    inputMode="url"
                    value={url}
                    maxLength={500}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                )}
              </Field>
            )}
          </>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-fg-muted">{t('previewHint')}</p>
            <div className="rounded-2xl bg-primary-soft p-5 text-on-primary-soft">
              <p className="font-semibold">{organization || '—'}</p>
              <p className="mt-2 text-2xl font-bold">{title || '—'}</p>
              <p className="mt-3">
                {location || (remote ? t('remoteLabel') : '—')} · {deadline || '—'}
              </p>
            </div>
            <p className="whitespace-pre-wrap break-words">{description || '—'}</p>
          </div>
        )}
      </section>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="secondary" loading={busy} onClick={() => saveDraft(false)}>
          {t('saveDraft')}
        </Button>
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            {t('previous')}
          </Button>
        )}
        <Button loading={busy} onClick={() => (step < 2 ? setStep(step + 1) : saveDraft(true))}>
          {t(step < 2 ? 'next' : 'submit')}
        </Button>
      </div>
    </div>
  );
}

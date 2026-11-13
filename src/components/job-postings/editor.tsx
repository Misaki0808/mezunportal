'use client';
import Link from 'next/link';
import messages from '../../../messages/tr.json';
import { useHydrated } from '@/hooks/use-hydrated';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import {
  JOB_POSTING_MAX_DAYS,
  type JobPostingFormContext,
  type JobPostingIdInput,
  type MyJobPostingView,
  type SaveJobPostingDraftInput,
  type SubmitJobPostingOutput,
} from '@/contracts/job-postings';
import type { ActionResult } from '@/contracts/result';
import { Button, Field, Input, Select, Textarea, useAction } from '@/components/ui';
import {
  addDays,
  istanbulDay,
  postingFieldStep,
  postingStepErrors,
  postingStepFields,
} from './model';
import { deadlineProblem } from '@/server/rules/jobPosting';

type Props = {
  context: JobPostingFormContext;
  initial?: MyJobPostingView;
  save: (input: SaveJobPostingDraftInput) => Promise<ActionResult<MyJobPostingView>>;
  submit: (input: JobPostingIdInput) => Promise<ActionResult<SubmitJobPostingOutput>>;
};
export function PostingEditor({ context, initial, save, submit }: Props) {
  const hydrated = useHydrated();
  const t = useTranslations('jobs');
  const errors = useTranslations('errors.codes');
  const fieldText = useTranslations('ui.field');
  const action = useAction();
  const tagLabels = useTranslations('profileTags');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const busy = action.busy;
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
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [targetGrades, setTargetGrades] = useState<number[]>(initial?.targetGrades ?? []);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const summary = useRef<HTMLDivElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const today = istanbulDay();
  const max = addDays(today, JOB_POSTING_MAX_DAYS);
  const stepTitle = t(step === 0 ? 'formBasics' : step === 1 ? 'formDetails' : 'formPreview');
  const stepLabel = `${t('step', { current: step + 1, total: 3 })}: ${stepTitle}`;
  const content = {
    kind,
    title,
    organizationName: organization,
    companyId:
      initial?.companyId && organization === initial.organizationName ? initial.companyId : null,
    location: location || null,
    isRemote: remote,
    description,
    deadlineOn: deadline || null,
    applyMethod: method,
    applyUrl: method === 'URL' ? url : null,
    targetDepartmentIds: targets,
    tagIds,
    targetGrades,
  };
  function focusTemporarily(element: HTMLElement | null) {
    if (!element) return;
    if (
      !element.hasAttribute('tabindex') &&
      !element.matches('input,select,textarea,button,a[href]')
    ) {
      element.setAttribute('tabindex', '-1');
      element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
    }
    element.focus();
    // Mobilde yapışkan işlem çubuğu ve alt gezinme odaklanan alanı örtmemeli.
    element.scrollIntoView?.({ block: 'center', inline: 'nearest' });
  }
  function changeStep(next: number) {
    setError('');
    setInvalid(new Set());
    setStep(next);
    requestAnimationFrame(() => focusTemporarily(stepHeading.current));
  }
  function showError(message: string, fields: string[] = []) {
    setError(message);
    setInvalid(new Set(fields));
    const first = fields.find((field) => postingFieldStep(field) !== undefined);
    if (first) setStep(postingFieldStep(first)!);
    requestAnimationFrame(() => {
      if (first)
        focusTemporarily(document.querySelector<HTMLElement>(`[data-error-field="${first}"]`));
      else summary.current?.focus();
    });
  }
  function validateStep(current: 0 | 1) {
    // Boş tarih sözleşmeye metin olarak verilir: diğer alanların koşullu kontrolleri de çalışır.
    return postingStepErrors({ ...content, deadlineOn: deadline }, departmentId, current, today);
  }
  function nextStep() {
    const fields = validateStep(step as 0 | 1);
    if (fields.length) {
      showError(t('formSummary'), fields);
      return;
    }
    changeStep(step + 1);
  }
  function saveDraft(thenSubmit: boolean) {
    setError('');
    if (!departmentId) {
      showError(t('formSummary'), ['departmentId']);
      return;
    }
    if (deadline && deadlineProblem(deadline, today)) {
      showError(t('invalidDate'), ['deadlineOn']);
      return;
    }
    if (thenSubmit) {
      const fields = [...validateStep(0), ...validateStep(1)];
      if (fields.length) {
        showError(t('formSummary'), fields);
        return;
      }
    }
    void action.run(
      async (): Promise<ActionResult<null>> => {
        const saved = await save({ ...(id ? { postingId: id } : {}), departmentId, content });
        if (!saved.ok) return saved;
        setId(saved.data.id);
        if (thenSubmit) {
          const sent = await submit({ postingId: saved.data.id });
          if (!sent.ok) return sent;
        }
        return { ok: true, data: null };
      },
      {
        success: thenSubmit ? t('submittedToast') : t('saved'),
        onOk: () => {
          if (thenSubmit) {
            router.push('/ilanlarim');
            router.refresh();
          }
        },
        onFailure: (failure) => {
          const serverFields = Object.keys(failure.fieldErrors ?? {}).map(
            (key) => key.replace(/^content\./, '').split('.')[0]!,
          );
          const ordered = postingStepFields.flat().filter((field) => serverFields.includes(field));
          showError(errors(failure.errorCode), ordered);
        },
      },
    );
  }
  const bad = (field: string) => (invalid.has(field) ? t('requiredError') : undefined);
  const fieldNames: Record<string, string> = {
    kind: t('kind'),
    title: t('titleLabel'),
    organizationName: t('organization'),
    departmentId: t('authorDepartment'),
    description: t('descriptionLabel'),
    location: t('locationLabel'),
    deadlineOn: t('deadline'),
    targetDepartmentIds: t('targetDepartments'),
    applyUrl: t('applyUrl'),
  };
  return (
    <div
      data-hydrated={hydrated ? 'true' : undefined}
      className="mx-auto max-w-3xl px-4 py-8 sm:px-6"
    >
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
          <span aria-current="step">{stepLabel}</span>
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
          <p>{error}</p>
          {invalid.size > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm">
              {[...invalid]
                .filter((field) => fieldNames[field])
                .map((field) => (
                  <li key={field}>
                    <button
                      type="button"
                      className="min-h-11 text-left underline"
                      onClick={() => {
                        setStep(postingFieldStep(field) ?? 0);
                        requestAnimationFrame(() =>
                          document
                            .querySelector<HTMLElement>(`[data-error-field="${field}"]`)
                            ?.focus(),
                        );
                      }}
                    >
                      {fieldNames[field]}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <section className="space-y-5 rounded-card border border-border bg-surface p-5 sm:p-7">
        <h2 ref={stepHeading} aria-label={stepLabel} className="text-xl font-bold">
          {stepTitle}
        </h2>
        {step === 0 && (
          <>
            <Field label={t('kind')} required>
              {(p) => (
                <Select
                  {...p}
                  data-error-field="kind"
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
                  data-error-field="title"
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
                  data-error-field="organizationName"
                  value={organization}
                  maxLength={120}
                  onChange={(e) => setOrganization(e.target.value)}
                  autoComplete="organization"
                />
              )}
            </Field>
            <Field label={t('authorDepartment')} required error={bad('departmentId')}>
              {(p) => (
                <Select
                  {...p}
                  data-error-field="departmentId"
                  value={departmentId}
                  onChange={(e) => setDepartment(e.target.value)}
                >
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
                  data-error-field="description"
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
                  data-error-field="location"
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
              hint={`${t('deadlineHint')} ${fieldText('dateUnset')}`}
              required
              error={bad('deadlineOn')}
            >
              {(p) => (
                <Input
                  {...p}
                  data-error-field="deadlineOn"
                  type="date"
                  min={today}
                  max={max}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              )}
            </Field>
            <fieldset
              tabIndex={-1}
              data-error-field="targetDepartmentIds"
              aria-invalid={invalid.has('targetDepartmentIds') || undefined}
              aria-describedby={
                invalid.has('targetDepartmentIds') ? 'posting-target-error' : undefined
              }
            >
              <legend className="font-semibold">{t('targetDepartments')}</legend>
              <p className="mt-1 text-sm text-fg-muted">
                {t('targetLimit', { count: context.limits.maxTargets })}
              </p>
              {bad('targetDepartmentIds') && (
                <p id="posting-target-error" role="alert" className="text-danger">
                  {bad('targetDepartmentIds')}
                </p>
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
                      disabled={
                        !targets.includes(d.id) && targets.length >= context.limits.maxTargets
                      }
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
            <fieldset>
              <legend className="font-semibold">{t('matchTags')}</legend>
              <p className="mt-1 text-sm text-fg-muted">{t('matchTagsHint')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {context.availableTags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex min-h-11 items-center gap-2 rounded-control border border-border px-3"
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={tagIds.includes(tag.id)}
                      disabled={!tagIds.includes(tag.id) && tagIds.length >= 5}
                      onChange={(e) =>
                        setTagIds((old) =>
                          e.target.checked ? [...old, tag.id] : old.filter((id) => id !== tag.id),
                        )
                      }
                    />
                    {tag.label ??
                      (tag.slug in messages.profileTags
                        ? tagLabels(tag.slug as keyof typeof messages.profileTags)
                        : tag.slug)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="font-semibold">{t('matchGrades')}</legend>
              <p className="mt-1 text-sm text-fg-muted">{t('matchGradesHint')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((grade) => (
                  <label
                    key={grade}
                    className="flex min-h-11 items-center gap-2 rounded-control border border-border px-3"
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={targetGrades.includes(grade)}
                      onChange={(e) =>
                        setTargetGrades((old) =>
                          e.target.checked ? [...old, grade] : old.filter((n) => n !== grade),
                        )
                      }
                    />
                    {t('matchGrade', { grade })}
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
                    data-error-field="applyUrl"
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
            <div className="rounded-card bg-primary-soft p-5 text-on-primary-soft">
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
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-2 mt-5 flex flex-wrap gap-3 rounded-card border border-border bg-surface/95 p-2 shadow-lg backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        <Button variant="secondary" loading={busy} onClick={() => saveDraft(false)}>
          {t('saveDraft')}
        </Button>
        {step > 0 && (
          <Button variant="secondary" onClick={() => changeStep(step - 1)}>
            {t('previous')}
          </Button>
        )}
        <Button loading={busy} onClick={() => (step < 2 ? nextStep() : saveDraft(true))}>
          {t(step < 2 ? 'next' : 'submit')}
        </Button>
      </div>
    </div>
  );
}

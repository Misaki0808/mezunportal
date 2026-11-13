'use client';
import Link from 'next/link';
import messages from '../../../messages/tr.json';
import { useHydrated } from '@/hooks/use-hydrated';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import {
  JOB_POSTING_MAX_DAYS,
  type JobPostingFormContext,
  type JobPostingIdInput,
  type MyJobPostingView,
  type SaveJobPostingDraftInput,
  type SubmitJobPostingOutput,
} from '@/contracts/job-postings';
import type { ActionResult } from '@/contracts/result';
import {
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
  useAction,
  type FieldProps,
} from '@/components/ui';
import { AlertIcon } from '@/components/ui/icons';
import {
  addDays,
  istanbulDay,
  postingFieldStep,
  postingStepErrors,
  postingStepFields,
} from './model';
import { deadlineProblem } from '@/server/rules/jobPosting';

/** Hata odağa bağlı okunur; diğer alanların eşzamanlı canlı duyurusu tekrarı önler. */
function PostingField({ error, children, ...props }: FieldProps) {
  const errorId = useId();
  return (
    <Field {...props}>
      {(control) => (
        <>
          {children({
            ...control,
            invalid: error ? true : control.invalid,
            'aria-describedby':
              [control['aria-describedby'], error && errorId].filter(Boolean).join(' ') ||
              undefined,
          })}
          {error && (
            <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger">
              <AlertIcon className="mt-0.5 shrink-0" width={16} height={16} />
              <span>{error}</span>
            </p>
          )}
        </>
      )}
    </Field>
  );
}

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
    // Fareyle önceki/sonraki adıma basıldığında başlık zaten odaktaysa da yeni adım duyurulsun.
    if (document.activeElement === element) element.blur();
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
      else focusTemporarily(summary.current);
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
          const serverFields = Object.keys(failure.fieldErrors ?? {}).map((key) => {
            const field = key.replace(/^content\./, '').split('.')[0]!;
            return field === 'companyId' ? 'organizationName' : field;
          });
          const ordered = postingStepFields.flat().filter((field) => serverFields.includes(field));
          const mapped = {
            JOB_POSTING_DEADLINE_INVALID: 'deadlineOn',
            JOB_POSTING_TARGET_INVALID: 'targetDepartmentIds',
            JOB_POSTING_URL_INVALID: method === 'URL' ? 'applyUrl' : 'applyMethod',
          } as const;
          const fallback = mapped[failure.errorCode as keyof typeof mapped];
          showError(
            errors(failure.errorCode),
            ordered.length ? ordered : fallback ? [fallback] : [],
          );
        },
      },
    );
  }
  const bad = (field: string) =>
    invalid.has(field)
      ? invalid.size === 1 && error !== t('formSummary')
        ? error
        : t('requiredError')
      : undefined;
  const fieldNames: Record<string, string> = {
    kind: t('kind'),
    title: t('titleLabel'),
    organizationName: t('organization'),
    departmentId: t('authorDepartment'),
    description: t('descriptionLabel'),
    location: t('locationLabel'),
    isRemote: t('remoteQuestion'),
    deadlineOn: t('deadline'),
    targetDepartmentIds: t('targetDepartments'),
    tagIds: t('matchTags'),
    targetGrades: t('matchGrades'),
    applyMethod: t('applyMethod'),
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
        <p aria-hidden="true" className="text-sm font-semibold text-fg-muted">
          {stepLabel}
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
                          focusTemporarily(
                            document.querySelector<HTMLElement>(`[data-error-field="${field}"]`),
                          ),
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
            <PostingField label={t('kind')} required error={bad('kind')}>
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
            </PostingField>
            <PostingField label={t('titleLabel')} required error={bad('title')}>
              {(p) => (
                <Input
                  {...p}
                  data-error-field="title"
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </PostingField>
            <PostingField label={t('organization')} required error={bad('organizationName')}>
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
            </PostingField>
            <PostingField label={t('authorDepartment')} required error={bad('departmentId')}>
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
            </PostingField>
          </>
        )}
        {step === 1 && (
          <>
            <PostingField label={t('descriptionLabel')} required error={bad('description')}>
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
            </PostingField>
            <PostingField label={t('locationLabel')} error={bad('location')}>
              {(p) => (
                <Input
                  {...p}
                  data-error-field="location"
                  value={location}
                  maxLength={100}
                  onChange={(e) => setLocation(e.target.value)}
                />
              )}
            </PostingField>
            <Checkbox
              label={t('remoteQuestion')}
              data-error-field="isRemote"
              aria-invalid={invalid.has('isRemote') || undefined}
              aria-describedby={invalid.has('isRemote') ? 'posting-remote-error' : undefined}
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
            />
            {bad('isRemote') && (
              <p id="posting-remote-error" className="text-danger">
                {bad('isRemote')}
              </p>
            )}
            <PostingField
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
            </PostingField>
            <fieldset
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
                <p id="posting-target-error" className="text-danger">
                  {bad('targetDepartmentIds')}
                </p>
              )}
              <div className="mt-2 grid gap-2">
                {context.targetDepartments.map((d) => (
                  <Checkbox
                    key={d.id}
                    label={`${d.name} · ${d.facultyName}`}
                    className="rounded-control border border-border px-3"
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
                ))}
              </div>
            </fieldset>
            <fieldset
              data-error-field="tagIds"
              aria-invalid={invalid.has('tagIds') || undefined}
              aria-describedby={invalid.has('tagIds') ? 'posting-tags-error' : undefined}
            >
              <legend className="font-semibold">{t('matchTags')}</legend>
              <p className="mt-1 text-sm text-fg-muted">{t('matchTagsHint')}</p>
              {bad('tagIds') && (
                <p id="posting-tags-error" className="text-danger">
                  {bad('tagIds')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {context.availableTags.map((tag) => (
                  <Checkbox
                    key={tag.id}
                    label={
                      tag.label ??
                      (tag.slug in messages.profileTags
                        ? tagLabels(tag.slug as keyof typeof messages.profileTags)
                        : tag.slug)
                    }
                    className="rounded-control border border-border px-3"
                    checked={tagIds.includes(tag.id)}
                    disabled={!tagIds.includes(tag.id) && tagIds.length >= 5}
                    onChange={(e) =>
                      setTagIds((old) =>
                        e.target.checked ? [...old, tag.id] : old.filter((id) => id !== tag.id),
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
            <fieldset
              data-error-field="targetGrades"
              aria-invalid={invalid.has('targetGrades') || undefined}
              aria-describedby={invalid.has('targetGrades') ? 'posting-grades-error' : undefined}
            >
              <legend className="font-semibold">{t('matchGrades')}</legend>
              <p className="mt-1 text-sm text-fg-muted">{t('matchGradesHint')}</p>
              {bad('targetGrades') && (
                <p id="posting-grades-error" className="text-danger">
                  {bad('targetGrades')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((grade) => (
                  <Checkbox
                    key={grade}
                    label={t('matchGrade', { grade })}
                    className="rounded-control border border-border px-3"
                    checked={targetGrades.includes(grade)}
                    onChange={(e) =>
                      setTargetGrades((old) =>
                        e.target.checked ? [...old, grade] : old.filter((n) => n !== grade),
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
            <PostingField label={t('applyMethod')} required error={bad('applyMethod')}>
              {(p) => (
                <Select
                  {...p}
                  data-error-field="applyMethod"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                >
                  <option value="URL">{t('urlMethod')}</option>
                  <option value="CONTACT_REQUEST">{t('contactMethod')}</option>
                </Select>
              )}
            </PostingField>
            {method === 'URL' && (
              <PostingField label={t('applyUrl')} required error={bad('applyUrl')}>
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
              </PostingField>
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

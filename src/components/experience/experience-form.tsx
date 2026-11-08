'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  APPLICATION_CHANNELS,
  EXPERIENCE_PAY,
  EXPERIENCE_TYPES,
  TERM_SEASONS,
  type ExperienceDetail,
  type ExperienceIdInput,
  type SaveExperienceDraftInput,
  type SubmitExperienceOutput,
} from '@/contracts/experience';
import type { ActionResult } from '@/contracts/result';
import {
  Button,
  Field,
  Input,
  Modal,
  PageHeader,
  RadioGroup,
  Select,
  Textarea,
  buttonClasses,
} from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import {
  FIELD_SECTIONS,
  fieldsOf,
  isRequired,
  type ExperienceType,
  type FieldKey,
} from './field-map';
import { emptyState, validate, type FieldErrors, type FormState } from './form-state';

export type DepartmentOption = { id: string; name: string };
export type InitialExperience = {
  id: string;
  departmentId: string;
  state: FormState;
  isAnonymous: boolean;
  moderationNote: string | null;
  appliedMonth?: number | null;
};

type Props = {
  departments: DepartmentOption[];
  initial?: InitialExperience;
  save: (input: SaveExperienceDraftInput) => Promise<ActionResult<ExperienceDetail>>;
  submit: (input: ExperienceIdInput) => Promise<ActionResult<SubmitExperienceOutput>>;
};

const MAX_LIST = 20;
const SCALAR_TEXT: readonly FieldKey[] = ['organizationName', 'country', 'city'];

export function ExperienceForm({ departments, initial, save, submit }: Props) {
  const t = useTranslations('experiences');
  const errorsT = useTranslations('errors.codes');
  const [state, setState] = useState<FormState>(initial?.state ?? emptyState());
  const [appliedMonth, setAppliedMonth] = useState(initial?.appliedMonth?.toString() ?? '');
  const calendar = useTranslations('applicationCalendar');
  const [departmentId, setDepartmentId] = useState(
    initial?.departmentId ?? (departments.length === 1 ? departments[0]!.id : ''),
  );
  const [isAnonymous, setIsAnonymous] = useState(initial?.isAnonymous ?? false);
  const [experienceId, setExperienceId] = useState(initial?.id);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [departmentError, setDepartmentError] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [notice, setNotice] = useState<'saved'>();
  const [confirm, setConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState<'save' | 'submit'>();
  const [focusTick, setFocusTick] = useState(0);
  const locked = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const type = state.type;
  const fields = fieldsOf(type);
  const departmentName = departments.find((item) => item.id === departmentId)?.name;

  // Hata varsa ilk hatalı alana odak (alan bazlı hata; klavye/ekran okuyucu için).
  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);
  useEffect(() => {
    if (submitted) doneRef.current?.focus();
  }, [submitted]);

  function update(patch: Partial<FormState>) {
    setState((current) => ({ ...current, ...patch }));
    setNotice(undefined);
    // Düzenlenen alanın hatası, kullanıcı yazmaya başlayınca kalkar (liste alanlarında satır hataları dahil).
    setFieldErrors((current) => {
      const touched = Object.keys(patch);
      const next = Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !touched.some((name) => key === name || key.startsWith(`${name}.`)),
        ),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }

  /** Doldurulmuş ama yeni türde sorulmayan alan var mı? (Kullanıcıya açıkça söylenir.) */
  function droppedFields(): boolean {
    const filled = (key: FieldKey) => {
      const value = state[key as keyof FormState];
      return Array.isArray(value)
        ? value.length > 0
        : typeof value === 'string' && value.trim() !== '';
    };
    const all = FIELD_SECTIONS.flatMap((section) => section.fields);
    return all.some((key) => !fields.has(key) && filled(key));
  }

  async function persist(mode: 'draft' | 'submit') {
    const validation = validate(state, mode);
    const noDepartment = departmentId === '';
    setFieldErrors(validation.ok ? {} : validation.errors);
    setDepartmentError(noDepartment);
    if (!validation.ok || noDepartment) {
      setFocusTick((tick) => tick + 1);
      return false;
    }
    const result = await save({
      ...(experienceId ? { experienceId } : {}),
      departmentId,
      content: validation.content,
      isAnonymous,
      appliedMonth: state.type === 'INTERNSHIP' && appliedMonth ? Number(appliedMonth) : null,
    });
    if (!result.ok) {
      setError(result.errorCode);
      return false;
    }
    setExperienceId(result.data.id);
    return result.data.id;
  }

  async function run(mode: 'draft' | 'submit') {
    if (locked.current) return;
    locked.current = true;
    setPending(mode === 'draft' ? 'save' : 'submit');
    setError(undefined);
    setNotice(undefined);
    try {
      const id = await persist(mode);
      if (id === false) {
        setConfirm(false);
        return;
      }
      if (mode === 'draft') {
        setNotice('saved');
        return;
      }
      const result = await submit({ experienceId: id });
      if (!result.ok) {
        setError(result.errorCode);
        setConfirm(false);
        return;
      }
      setConfirm(false);
      setSubmitted(true);
    } catch {
      setError('SERVER_UNEXPECTED');
      setConfirm(false);
    } finally {
      locked.current = false;
      setPending(undefined);
    }
  }

  function openConfirm() {
    const validation = validate(state, 'submit');
    const noDepartment = departmentId === '';
    setFieldErrors(validation.ok ? {} : validation.errors);
    setDepartmentError(noDepartment);
    setError(undefined);
    if (!validation.ok || noDepartment) {
      setFocusTick((tick) => tick + 1);
      return;
    }
    setConfirm(true);
  }

  if (submitted) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-5 py-14 text-center">
        <h1
          ref={doneRef}
          tabIndex={-1}
          className="text-2xl font-semibold text-fg focus:outline-none"
        >
          {t('form.submitted')}
        </h1>
        <p className="max-w-prose text-base text-fg-muted">{t('statusHint.PENDING')}</p>
        <Link className={buttonClasses({ size: 'lg' })} href="/deneyimlerim">
          {t('form.submittedAction')}
        </Link>
      </div>
    );
  }

  const label = (key: FieldKey) => t(`form.fields.${key}`);
  const errorOf = (key: string) => {
    const kind = fieldErrors[key];
    return kind ? t(`fieldErrors.${kind}`) : undefined;
  };
  const required = (key: FieldKey) => isRequired(type, key);
  const hintOf = (key: FieldKey) =>
    (
      ['organizationName', 'durationWeeks', 'whatLearned', 'advice', 'interviewQuestions'] as const
    ).includes(key as 'organizationName')
      ? t(`form.hints.${key as 'organizationName'}`)
      : undefined;

  function renderField(key: FieldKey) {
    if (!fields.has(key)) return null;
    if (SCALAR_TEXT.includes(key)) {
      const value = state[key as 'organizationName'];
      return (
        <Field
          key={key}
          label={label(key)}
          hint={hintOf(key)}
          error={errorOf(key)}
          required={required(key)}
        >
          {(control) => (
            <Input
              {...control}
              value={value}
              onChange={(event) => update({ [key]: event.target.value })}
            />
          )}
        </Field>
      );
    }
    if (key === 'termYear' || key === 'durationWeeks') {
      return (
        <Field
          key={key}
          label={label(key)}
          hint={hintOf(key)}
          error={errorOf(key)}
          required={required(key)}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              autoComplete="off"
              value={state[key]}
              onChange={(event) => update({ [key]: event.target.value })}
            />
          )}
        </Field>
      );
    }
    if (key === 'termSeason') {
      return (
        <Field key={key} label={label(key)} error={errorOf(key)} required={required(key)}>
          {(control) => (
            <Select
              {...control}
              value={state.termSeason}
              onChange={(event) => update({ termSeason: event.target.value })}
            >
              <option value="">{t('form.select')}</option>
              {TERM_SEASONS.map((value) => (
                <option key={value} value={value}>
                  {t(`seasons.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      );
    }
    if (key === 'pay') {
      return (
        <Field key={key} label={label(key)} error={errorOf(key)} required={required(key)}>
          {(control) => (
            <Select
              {...control}
              value={state.pay}
              onChange={(event) => update({ pay: event.target.value })}
            >
              <option value="">{t('form.select')}</option>
              {EXPERIENCE_PAY.map((value) => (
                <option key={value} value={value}>
                  {t(`pay.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      );
    }
    if (key === 'applicationChannel') {
      return (
        <Field key={key} label={label(key)} error={errorOf(key)} required={required(key)}>
          {(control) => (
            <Select
              {...control}
              value={state.applicationChannel}
              onChange={(event) => update({ applicationChannel: event.target.value })}
            >
              <option value="">{t('form.select')}</option>
              {APPLICATION_CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {t(`channels.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      );
    }
    if (key === 'whatLearned' || key === 'advice') {
      return (
        <Field
          key={key}
          label={label(key)}
          hint={hintOf(key)}
          error={errorOf(key)}
          required={required(key)}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={6}
              value={state[key]}
              onChange={(event) => update({ [key]: event.target.value })}
            />
          )}
        </Field>
      );
    }
    if (key === 'processSteps') {
      return (
        <fieldset key={key} className="flex flex-col gap-3">
          <legend className="mb-1 font-medium text-fg">{label(key)}</legend>
          {state.processSteps.map((step, index) => (
            <div key={index} className="flex flex-col gap-3 rounded-card border border-border p-4">
              <p className="text-base font-semibold text-fg">
                {t('form.stepNumber', { n: index + 1 })}
              </p>
              <Field
                label={t('form.stepTitle')}
                error={errorOf(`processSteps.${index}.title`)}
                required
              >
                {(control) => (
                  <Input
                    {...control}
                    value={step.title}
                    onChange={(event) =>
                      update({
                        processSteps: state.processSteps.map((item, at) =>
                          at === index ? { ...item, title: event.target.value } : item,
                        ),
                      })
                    }
                  />
                )}
              </Field>
              <Field
                label={t('form.stepDescription')}
                error={errorOf(`processSteps.${index}.description`)}
                required
              >
                {(control) => (
                  <Textarea
                    {...control}
                    rows={3}
                    value={step.description}
                    onChange={(event) =>
                      update({
                        processSteps: state.processSteps.map((item, at) =>
                          at === index ? { ...item, description: event.target.value } : item,
                        ),
                      })
                    }
                  />
                )}
              </Field>
              <Button
                variant="ghost"
                onClick={() =>
                  update({ processSteps: state.processSteps.filter((_, at) => at !== index) })
                }
              >
                {t('form.removeStep')}
              </Button>
            </div>
          ))}
          {state.processSteps.length < MAX_LIST && (
            <Button
              variant="secondary"
              onClick={() =>
                update({ processSteps: [...state.processSteps, { title: '', description: '' }] })
              }
            >
              {t('form.addStep')}
            </Button>
          )}
        </fieldset>
      );
    }
    if (key === 'interviewQuestions') {
      return (
        <fieldset key={key} className="flex flex-col gap-3">
          <legend className="mb-1 font-medium text-fg">{label(key)}</legend>
          <p className="text-sm text-fg-muted">{t('form.hints.interviewQuestions')}</p>
          {state.interviewQuestions.map((question, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Field
                label={t('form.questionLabel', { n: index + 1 })}
                error={errorOf(`interviewQuestions.${index}`)}
              >
                {(control) => (
                  <Input
                    {...control}
                    value={question}
                    onChange={(event) =>
                      update({
                        interviewQuestions: state.interviewQuestions.map((item, at) =>
                          at === index ? event.target.value : item,
                        ),
                      })
                    }
                  />
                )}
              </Field>
              <Button
                variant="ghost"
                onClick={() =>
                  update({
                    interviewQuestions: state.interviewQuestions.filter((_, at) => at !== index),
                  })
                }
              >
                {t('form.removeQuestion')}
              </Button>
            </div>
          ))}
          {state.interviewQuestions.length < MAX_LIST && (
            <Button
              variant="secondary"
              onClick={() => update({ interviewQuestions: [...state.interviewQuestions, ''] })}
            >
              {t('form.addQuestion')}
            </Button>
          )}
        </fieldset>
      );
    }
    return null;
  }

  const sectionTitle = {
    about: t('form.sections.about'),
    process: t('form.sections.process'),
    story: t('form.sections.story'),
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        openConfirm();
      }}
      className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-10 sm:pt-16"
    >
      <PageHeader
        eyebrow={t('eyebrow')}
        title={initial ? t('form.editTitle') : t('form.newTitle')}
        description={t('form.description')}
      />

      {initial?.moderationNote && (
        <section className="mt-6 rounded-card border border-danger bg-danger-soft p-4 text-on-danger-soft">
          <h2 className="text-base font-semibold">{t('rejection.title')}</h2>
          <p className="mt-1 whitespace-pre-line text-base">{initial.moderationNote}</p>
        </section>
      )}

      <div className="mt-6 flex flex-col gap-5">
        <Field label={t('form.typeLegend')} required>
          {(control) => (
            <Select
              {...control}
              value={type}
              onChange={(event) => update({ type: event.target.value as ExperienceType })}
            >
              {EXPERIENCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`types.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {droppedFields() && (
          <p
            role="status"
            className="rounded-control bg-warning-soft p-3 text-base text-on-warning-soft"
          >
            {t('form.typeChanged')}
          </p>
        )}

        {initial ? (
          <div>
            <p className="font-medium text-fg">{t('form.department')}</p>
            <p className="text-base text-fg">{departmentName}</p>
            <p className="text-sm text-fg-muted">{t('form.departmentLocked')}</p>
          </div>
        ) : departments.length > 1 ? (
          <Field
            label={t('form.department')}
            error={departmentError ? t('fieldErrors.required') : undefined}
            required
          >
            {(control) => (
              <Select
                {...control}
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">{t('form.departmentPlaceholder')}</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <div>
            <p className="font-medium text-fg">{t('form.department')}</p>
            <p className="text-base text-fg">{departmentName}</p>
          </div>
        )}

        {FIELD_SECTIONS.map((section) => {
          const visible = section.fields.filter((key) => fields.has(key));
          if (visible.length === 0) return null;
          return (
            <section key={section.id} className="flex flex-col gap-5">
              <h2 className="text-xl font-semibold text-fg">{sectionTitle[section.id]}</h2>
              {visible.map(renderField)}
            </section>
          );
        })}

        {type === 'INTERNSHIP' && (
          <Field label={calendar('monthLabel')} hint={calendar('monthHint')}>
            {(control) => (
              <Select
                {...control}
                value={appliedMonth}
                onChange={(event) => setAppliedMonth(event.target.value)}
              >
                <option value="">{calendar('monthUnknown')}</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month}>
                    {calendar(`months.${month as 1}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-fg">{t('form.sections.privacy')}</h2>
          <RadioGroup
            legend={t('form.anonymousLegend')}
            name="anonymous"
            value={isAnonymous ? 'anonymous' : 'named'}
            onValueChange={(value) => setIsAnonymous(value === 'anonymous')}
            options={[
              { value: 'named', label: t('form.named'), description: t('form.namedDescription') },
              {
                value: 'anonymous',
                label: t('form.anonymous'),
                description: t('form.anonymousDescription'),
              },
            ]}
          />
        </section>
      </div>

      <div className="sticky-actions z-20 mt-8 space-y-2 bg-bg pt-4 pb-2 lg:pt-8">
        {error && (
          <p role="alert" className="text-base text-danger">
            {errorsT(error)}
          </p>
        )}
        {Object.keys(fieldErrors).length > 0 && !error && (
          <div role="alert" className="flex flex-wrap items-center gap-x-3 text-base text-danger">
            <span>{t('form.fixErrors')}</span>
            <button
              type="button"
              className="press-row min-h-11 font-medium underline"
              onClick={() => setFocusTick((tick) => tick + 1)}
            >
              {t('form.goToFirstError')}
            </button>
          </div>
        )}
        {notice === 'saved' && (
          <p role="status" className="text-base text-on-success-soft">
            {t('form.draftSaved')}
          </p>
        )}
        <Button type="submit" size="lg" fullWidth loading={pending === 'submit'}>
          {t('form.submit')}
        </Button>
        <Button
          variant="ghost"
          fullWidth
          loading={pending === 'save'}
          onClick={() => void run('draft')}
        >
          {pending === 'save' ? t('form.saving') : t('form.saveDraft')}
        </Button>
      </div>

      <Modal
        open={confirm}
        onClose={() => !pending && setConfirm(false)}
        title={t('form.submitConfirmTitle')}
        description={t('form.submitConfirmDescription')}
        footer={
          <>
            <Button fullWidth loading={pending === 'submit'} onClick={() => void run('submit')}>
              {t('form.submit')}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setConfirm(false)}>
              {t('form.cancel')}
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </form>
  );
}

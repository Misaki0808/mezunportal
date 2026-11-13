'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

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
  Stepper,
  Textarea,
  buttonClasses,
  useAction,
} from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';

import {
  FIELD_SECTIONS,
  fieldsOf,
  isRequired,
  type ExperienceType,
  type FieldKey,
} from './field-map';
import {
  emptyState,
  formSnapshot,
  sectionComplete,
  validate,
  type FieldErrors,
  type FormState,
} from './form-state';

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
  const initialDepartmentId =
    initial?.departmentId ?? (departments.length === 1 ? departments[0]!.id : '');
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);
  const [isAnonymous, setIsAnonymous] = useState(initial?.isAnonymous ?? false);
  const router = useRouter();
  const [experienceId, setExperienceId] = useState(initial?.id);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [departmentError, setDepartmentError] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Son kaydedilen (ya da ilk yüklenen) içeriğin özeti: farklıysa "kaydedilmemiş değişiklik" vardır.
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    formSnapshot({
      state: initial?.state ?? emptyState(),
      appliedMonth: initial?.appliedMonth?.toString() ?? '',
      departmentId: initialDepartmentId,
      isAnonymous: initial?.isAnonymous ?? false,
    }),
  );
  const [leaveTo, setLeaveTo] = useState<string>();
  const [pendingMode, setPendingMode] = useState<'save' | 'submit'>();
  const pending = action.busy ? pendingMode : undefined;
  const [focusTick, setFocusTick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const type = state.type;
  const snapshot = formSnapshot({ state, appliedMonth, departmentId, isAnonymous });
  const dirty = !submitted && snapshot !== savedSnapshot;
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

  // Kaydedilmemiş değişiklik varken sekmeyi kapatma/yenileme tarayıcı uyarısıyla sorulur.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Uygulama içi bağlantıyla çıkış tarayıcı olayı vermez: tıklama yakalanır, "taslağı kaydet / kaydetmeden çık" sorulur.
  useEffect(() => {
    if (!dirty) return;
    const intercept = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, [dirty]);

  function update(patch: Partial<FormState>) {
    setState((current) => ({ ...current, ...patch }));
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

  /** Kaydeder (ve istenirse gönderir); başarıda `true` döner. Doğrulama ya da sunucu hatasında `false`. */
  async function run(mode: 'draft' | 'submit'): Promise<boolean> {
    const validation = validate(state, mode);
    const noDepartment = departmentId === '';
    setFieldErrors(validation.ok ? {} : validation.errors);
    setDepartmentError(noDepartment);
    if (!validation.ok || noDepartment) {
      setFocusTick((tick) => tick + 1);
      setConfirm(false);
      return false;
    }
    setError(undefined);
    const savedNow = snapshot;
    let ok = false;
    await action.run(
      async (): Promise<ActionResult<null>> => {
        setPendingMode(mode === 'draft' ? 'save' : 'submit');
        const saved = await save({
          ...(experienceId ? { experienceId } : {}),
          departmentId,
          content: validation.content,
          isAnonymous,
          appliedMonth: state.type === 'INTERNSHIP' && appliedMonth ? Number(appliedMonth) : null,
        });
        if (!saved.ok) return saved;
        setExperienceId(saved.data.id);
        // Gönderme ayrı bir istektir; o adım hata verse de bu içerik taslakta kaydedilmiştir.
        setSavedSnapshot(savedNow);
        if (mode === 'submit') {
          const sent = await submit({ experienceId: saved.data.id });
          if (!sent.ok) return sent;
        }
        return { ok: true, data: null };
      },
      {
        success: mode === 'draft' ? t('form.draftSaved') : t('form.submitted'),
        onOk: () => {
          ok = true;
          if (mode === 'submit') {
            setConfirm(false);
            setSubmitted(true);
          }
        },
        onFailure: (failure) => {
          setError(failure.errorCode);
          setConfirm(false);
        },
      },
    );
    return ok;
  }

  /** "Taslağı kaydet ve çık": kayıt başarısızsa (alan hatası, sunucu hatası) yerinde kalır ve hata görünür. */
  async function saveAndLeave() {
    const target = leaveTo;
    const saved = await run('draft');
    setLeaveTo(undefined);
    if (saved && target) router.push(target);
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
      [
        'organizationName',
        'termYear',
        'country',
        'city',
        'durationWeeks',
        'pay',
        'whatLearned',
        'advice',
        'interviewQuestions',
      ] as const
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
        <Field
          key={key}
          label={label(key)}
          hint={hintOf(key)}
          error={errorOf(key)}
          required={required(key)}
        >
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
    type: t('form.sections.type'),
    about: t('form.sections.about'),
    process: t('form.sections.process'),
    story: t('form.sections.story'),
    privacy: t('form.sections.privacy'),
  };
  // Adım hissi: bölümler sırayla numaralanır; ilerleme şeridi ilk eksik bölümü "şu anki adım" gösterir.
  // Yalnız sunum: doğrulama ve gönderme akışı değişmez, bölümler istenen sırayla doldurulabilir.
  const visibleSections = FIELD_SECTIONS.filter((section) =>
    section.fields.some((key) => fields.has(key)),
  );
  const steps = [
    { id: 'type', done: departmentId !== '' },
    ...visibleSections.map((section) => ({
      id: section.id,
      done: sectionComplete(state, section.fields),
    })),
    { id: 'privacy', done: true },
  ];
  const firstOpen = steps.findIndex((step) => !step.done);
  const currentStep = firstOpen === -1 ? steps.length - 1 : firstOpen;
  const numberOf = (id: string) => steps.findIndex((step) => step.id === id) + 1;

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

      <Stepper
        steps={steps.map((step) => ({
          id: step.id,
          label: sectionTitle[step.id as keyof typeof sectionTitle],
        }))}
        current={currentStep}
        className="mt-6"
      />

      <div className="mt-6 flex flex-col gap-4">
        <FormSection
          id="type"
          number={numberOf('type')}
          title={sectionTitle.type}
          intro={t('form.intro.type')}
        >
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
        </FormSection>

        {visibleSections.map((section) => {
          const visible = section.fields.filter((key) => fields.has(key));
          return (
            <FormSection
              key={section.id}
              id={section.id}
              number={numberOf(section.id)}
              title={sectionTitle[section.id]}
              intro={t(`form.intro.${section.id}`)}
            >
              {visible.map(renderField)}
              {section.id === 'process' && type === 'INTERNSHIP' && (
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
            </FormSection>
          );
        })}

        <FormSection
          id="privacy"
          number={numberOf('privacy')}
          title={sectionTitle.privacy}
          intro={t('form.intro.privacy')}
        >
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
        </FormSection>
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

      <Modal
        open={leaveTo !== undefined}
        onClose={() => !pending && setLeaveTo(undefined)}
        title={t('form.leave.title')}
        description={t('form.leave.description')}
        footer={
          <>
            <Button fullWidth loading={pending === 'save'} onClick={() => void saveAndLeave()}>
              {t('form.leave.save')}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                if (pending) return;
                const target = leaveTo;
                setLeaveTo(undefined);
                if (target) router.push(target);
              }}
            >
              {t('form.leave.discard')}
            </Button>
            <Button
              variant="ghost"
              fullWidth
              onClick={() => {
                if (!pending) setLeaveTo(undefined);
              }}
            >
              {t('form.leave.stay')}
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </form>
  );
}

/** Numaralı bölüm kartı: adım numarası, başlık ve tek cümlelik sıcak bir giriş. */
function FormSection({
  id,
  number,
  title,
  intro,
  children,
}: {
  id: string;
  number: number;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const headingId = `section-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-5 rounded-card border border-border p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-on-primary-soft"
        >
          {number}
        </span>
        <div className="min-w-0">
          <h2 id={headingId} className="text-xl font-semibold text-fg">
            {title}
          </h2>
          <p className="mt-0.5 text-base text-fg-muted">{intro}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

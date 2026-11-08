'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  saveOnboardingStepSchema,
  skipOnboardingStepSchema,
  ONBOARDING_STEPS,
  type OnboardingState,
  type ProfileTagsOutput,
  type SaveOnboardingStepInput,
  type SkipOnboardingStepInput,
  type OnboardingStepName,
} from '@/contracts/profile';
import type { ActionResult } from '@/contracts/result';
import {
  VISIBILITY_LEVELS,
  setFieldVisibilitySchema,
  type FieldVisibilitySettings,
  type SetFieldVisibilityInput,
} from '@/contracts/privacy';
import { Button, Checkbox, EmptyState, Field, Select, buttonClasses } from '@/components/ui';
import type { ErrorCode } from '@/lib/errors';
import type messages from '../../../../messages/tr.json';

type Tag = ProfileTagsOutput['tags'][number];
type Save = (input: SaveOnboardingStepInput) => Promise<ActionResult<OnboardingState>>;

export function OnboardingFlow({
  initialState,
  interests,
  goals,
  save,
  skip,
  initialVisibility,
  saveVisibility,
  editInitially = false,
}: {
  initialState: OnboardingState;
  interests: Tag[];
  goals: Tag[];
  save: Save;
  skip: (input: SkipOnboardingStepInput) => Promise<ActionResult<OnboardingState>>;
  initialVisibility: FieldVisibilitySettings;
  saveVisibility: (
    input: SetFieldVisibilityInput,
  ) => Promise<ActionResult<FieldVisibilitySettings>>;
  editInitially?: boolean;
}) {
  const t = useTranslations('onboarding');
  const tags = useTranslations('profileTags');
  const errors = useTranslations('errors.codes');
  const [state, setState] = useState(() => {
    if (!editInitially || initialState.step === 'MEMBERSHIP') return initialState;
    const missing = initialState.steps.find(
      (item) => item.step !== 'MEMBERSHIP' && item.applicable && item.status !== 'COMPLETED',
    );
    return { ...initialState, step: missing?.step ?? 'INTERESTS' };
  });
  const [interestDraft, setInterestDraft] = useState(initialState.interestTagIds);
  const [goalDraft, setGoalDraft] = useState(initialState.goalTagIds);
  const editing = useRef(editInitially);
  const [error, setError] = useState<ErrorCode>();
  const [emptySelection, setEmptySelection] = useState(false);
  const [pending, setPending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [visibility, setVisibility] = useState(initialVisibility);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(initialState.step);
  function availableSteps(data: OnboardingState): OnboardingStepName[] {
    return ONBOARDING_STEPS.filter(
      (step) =>
        step !== 'MEMBERSHIP' &&
        (step === 'COMPLETE' || data.steps.some((item) => item.step === step && item.applicable)),
    );
  }
  function updateAfterChange(data: OnboardingState, current: OnboardingStepName) {
    if (!editing.current || current === 'COMPLETE') {
      setState(data);
      return;
    }
    const steps = availableSteps(data);
    setState({ ...data, step: steps[steps.indexOf(current) + 1] ?? 'COMPLETE' });
  }
  useEffect(() => {
    if (previousStep.current !== state.step) {
      heading.current?.focus();
      previousStep.current = state.step;
    }
  }, [state.step]);
  useEffect(() => {
    if (finished) heading.current?.focus();
  }, [finished]);

  async function submit(input: SaveOnboardingStepInput) {
    if (locked.current) return;
    if ((input.step === 'INTERESTS' || input.step === 'GOALS') && input.tagIds.length === 0) {
      setEmptySelection(true);
      return;
    }
    const parsed = saveOnboardingStepSchema.safeParse(input);
    if (!parsed.success) {
      setError('VALIDATION_INVALID');
      return;
    }
    locked.current = true;
    setEmptySelection(false);
    setPending(true);
    setError(undefined);
    try {
      const result = await save(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      updateAfterChange(result.data, input.step);
      if (input.step === 'COMPLETE') setFinished(true);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  async function skipStep(input: SkipOnboardingStepInput) {
    if (locked.current) return;
    const parsed = skipOnboardingStepSchema.safeParse(input);
    if (!parsed.success) {
      setError('VALIDATION_INVALID');
      return;
    }
    locked.current = true;
    setPending(true);
    setError(undefined);
    setEmptySelection(false);
    try {
      const result = await skip(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      updateAfterChange(result.data, input.step);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  async function changeVisibility(input: SetFieldVisibilityInput) {
    if (locked.current) return;
    const parsed = setFieldVisibilitySchema.safeParse(input);
    if (!parsed.success) {
      setError('VALIDATION_INVALID');
      return;
    }
    locked.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await saveVisibility(parsed.data);
      if (result.ok) setVisibility(result.data);
      else setError(result.errorCode);
    } catch {
      setError('SERVER_UNEXPECTED');
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  const step = state.step;
  const selected = step === 'GOALS' ? goalDraft : interestDraft;
  const setSelected = step === 'GOALS' ? setGoalDraft : setInterestDraft;
  const steps = availableSteps(state);
  const previous = steps.indexOf(step) > 0 ? steps[steps.indexOf(step) - 1] : undefined;
  const showTags = step === 'INTERESTS' || step === 'GOALS';
  const choices = step === 'INTERESTS' ? interests : goals;
  const availableChoices = choices
    .filter((tag) => tags.has(tag.slug as keyof typeof messages.profileTags))
    .sort((a, b) =>
      tags(a.slug as keyof typeof messages.profileTags).localeCompare(
        tags(b.slug as keyof typeof messages.profileTags),
        'tr',
      ),
    );
  // Sayfaya geri dönen kullanıcı: sunucuda COMPLETE ve bekleyen uygulanabilir adım yok → tamamlandı
  // görünümü (“Son bir adım” tekrar gösterilmez). Oturum içi akışta bitirme düğmesi korunur.
  const done =
    finished ||
    (initialState.step === 'COMPLETE' &&
      state.step === 'COMPLETE' &&
      initialState.steps.every((item) => !item.applicable || item.status !== 'PENDING'));
  const mentorAvailable = state.steps.some(
    (item) => item.step === 'MENTOR_PREFERENCE' && item.applicable,
  );
  const skippable = state.steps.some(
    (item) => item.step === step && item.skippable && item.applicable,
  );
  const title =
    step === 'MEMBERSHIP'
      ? t('membershipTitle')
      : step === 'INTERESTS'
        ? t('interestsTitle')
        : step === 'GOALS'
          ? t('goalsTitle')
          : step === 'MENTOR_PREFERENCE'
            ? t('mentorTitle')
            : step === 'VISIBILITY'
              ? t('visibilityTitle')
              : t(done ? 'completeTitle' : 'readyTitle');
  const description =
    step === 'MEMBERSHIP'
      ? t('membershipDescription')
      : step === 'INTERESTS'
        ? t('interestsDescription')
        : step === 'GOALS'
          ? t('goalsDescription')
          : step === 'MENTOR_PREFERENCE'
            ? t('mentorDescription')
            : step === 'VISIBILITY'
              ? t('visibilityDescription')
              : t(done ? 'completeDescription' : 'readyDescription');
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-10 sm:pt-16">
      <p className="text-base font-semibold text-primary">{t('eyebrow')}</p>
      <div
        className="mt-5"
        aria-label={t('progress', { percent: state.completion.percent })}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.completion.percent}
      >
        <div className="h-2 overflow-hidden rounded-full bg-surface-strong">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${state.completion.percent}%` }}
          />
        </div>
        <p className="mt-2 text-base text-fg-muted">
          {t('progress', { percent: state.completion.percent })}
        </p>
      </div>
      <h1
        ref={heading}
        tabIndex={-1}
        className="mt-8 text-3xl font-semibold tracking-tight text-fg focus:outline-none"
      >
        {title}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-fg-muted">{description}</p>
      {showTags &&
        (availableChoices.length ? (
          <fieldset className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <legend className="mb-3 text-base text-fg-muted">{t('selectionHint')}</legend>
            {availableChoices.map((tag) => (
              <Checkbox
                key={tag.id}
                label={tags(tag.slug as keyof typeof messages.profileTags)}
                checked={selected.includes(tag.id)}
                disabled={pending}
                onChange={(event) =>
                  setSelected((old) =>
                    event.target.checked ? [...old, tag.id] : old.filter((id) => id !== tag.id),
                  )
                }
                className="rounded-control border border-border px-3"
              />
            ))}
          </fieldset>
        ) : (
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={
              <Button variant="secondary" onClick={() => window.location.reload()}>
                {t('retry')}
              </Button>
            }
          />
        ))}
      {step === 'MENTOR_PREFERENCE' && mentorAvailable && (
        <div className="mt-6 grid gap-3">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            loading={pending}
            onClick={() => void submit({ step: 'MENTOR_PREFERENCE', interested: true })}
          >
            {t('mentorYes')}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            loading={pending}
            onClick={() => void submit({ step: 'MENTOR_PREFERENCE', interested: false })}
          >
            {t('mentorNo')}
          </Button>
        </div>
      )}
      {step === 'MENTOR_PREFERENCE' && !mentorAvailable && (
        <EmptyState title={t('unavailable')} description={t('unavailableDescription')} />
      )}
      {step === 'VISIBILITY' && (
        <div className="mt-6 grid gap-4">
          {visibility.fields.map(({ field, level }) => (
            <Field key={field} label={t(`fields.${field}`)}>
              {(control) => (
                <Select
                  {...control}
                  value={level}
                  disabled={pending}
                  onChange={(event) =>
                    void changeVisibility({
                      field,
                      level: event.target.value as SetFieldVisibilityInput['level'],
                    })
                  }
                >
                  {VISIBILITY_LEVELS.map((choice) => (
                    <option key={choice} value={choice}>
                      {t(`levels.${choice}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ))}
        </div>
      )}
      {step === 'COMPLETE' && state.completion.missing.length > 0 && (
        <section className="mt-6 rounded-card border border-border p-4">
          <h2 className="text-base font-semibold text-fg">{t('missingTitle')}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-fg-muted">
            {state.completion.missing.map((item) => (
              <li key={item}>{t(`steps.${item}`)}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-fg-muted">{t('missingDescription')}</p>
        </section>
      )}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-auto space-y-2 bg-bg pt-4 pb-2 lg:static lg:pt-8">
        {/* Hata, eylem düğmesinin hemen üstünde: 390'da uzun listenin altında görünmeden kalmaz. */}
        {error && (
          <p role="alert" className="text-base text-danger">
            {errors(error)}
          </p>
        )}
        {emptySelection && (
          <p role="alert" className="text-base text-danger">
            {t('chooseOrSkip')}
          </p>
        )}
        <div className="flex items-stretch gap-3">
          {previous && (
            <Button
              variant="secondary"
              loading={pending}
              onClick={() => {
                editing.current = true;
                setFinished(false);
                setError(undefined);
                setEmptySelection(false);
                setState((current) => ({ ...current, step: previous }));
              }}
            >
              {t('back')}
            </Button>
          )}
          <div className="min-w-0 flex-1">
            {step === 'MEMBERSHIP' && (
              <Link className={buttonClasses({ fullWidth: true, size: 'lg' })} href="/dogrulama">
                {t('membershipAction')}
              </Link>
            )}
            {showTags && availableChoices.length > 0 && (
              <>
                <Button
                  size="lg"
                  fullWidth
                  loading={pending}
                  onClick={() => void submit({ step, tagIds: selected })}
                >
                  {pending ? t('saving') : t('next')}
                </Button>
              </>
            )}
            {step === 'VISIBILITY' && (
              <Button
                size="lg"
                fullWidth
                loading={pending}
                onClick={() => void submit({ step: 'VISIBILITY', confirmed: true })}
              >
                {pending ? t('saving') : t('visibilityConfirm')}
              </Button>
            )}
            {step === 'COMPLETE' && !done && (
              <Button
                size="lg"
                fullWidth
                loading={pending}
                onClick={() => void submit({ step: 'COMPLETE' })}
              >
                {pending ? t('saving') : t('finish')}
              </Button>
            )}
            {step === 'COMPLETE' && done && (
              <Link className={buttonClasses({ fullWidth: true, size: 'lg' })} href="/">
                {t('home')}
              </Link>
            )}
          </div>
        </div>
        {skippable &&
          (step === 'INTERESTS' ||
            step === 'GOALS' ||
            step === 'MENTOR_PREFERENCE' ||
            step === 'VISIBILITY') && (
            <Button
              variant="ghost"
              fullWidth
              loading={pending}
              onClick={() => void skipStep({ step })}
            >
              {t('skip')}
            </Button>
          )}
      </div>
    </div>
  );
}

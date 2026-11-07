'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  saveOnboardingStepSchema,
  type OnboardingState,
  type ProfileTagsOutput,
  type SaveOnboardingStepInput,
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
  initialVisibility,
  saveVisibility,
}: {
  initialState: OnboardingState;
  interests: Tag[];
  goals: Tag[];
  save: Save;
  initialVisibility: FieldVisibilitySettings;
  saveVisibility: (
    input: SetFieldVisibilityInput,
  ) => Promise<ActionResult<FieldVisibilitySettings>>;
}) {
  const t = useTranslations('onboarding');
  const tags = useTranslations('profileTags');
  const errors = useTranslations('errors.codes');
  const [state, setState] = useState(initialState);
  const [selected, setSelected] = useState<string[]>(
    initialState.step === 'GOALS' ? initialState.goalTagIds : initialState.interestTagIds,
  );
  const [error, setError] = useState<ErrorCode>();
  const [pending, setPending] = useState(false);
  const [visibility, setVisibility] = useState(initialVisibility);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(initialState.step);
  useEffect(() => {
    if (previousStep.current !== state.step) {
      heading.current?.focus();
      previousStep.current = state.step;
    }
  }, [state.step]);

  async function submit(input: SaveOnboardingStepInput) {
    if (locked.current) return;
    const parsed = saveOnboardingStepSchema.safeParse(input);
    if (!parsed.success) {
      setError('VALIDATION_INVALID');
      return;
    }
    locked.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await save(parsed.data);
      if (!result.ok) {
        setError(result.errorCode);
        return;
      }
      setState(result.data);
      setSelected(
        result.data.step === 'GOALS' ? result.data.goalTagIds : result.data.interestTagIds,
      );
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
  const showTags = step === 'INTERESTS' || step === 'GOALS';
  const choices = step === 'INTERESTS' ? interests : goals;
  const availableChoices = choices.filter((tag) =>
    tags.has(tag.slug as keyof typeof messages.profileTags),
  );
  const mentorAvailable =
    !state.studentMentorEligibility || state.studentMentorEligibility.eligible;
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
              : t('completeTitle');
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
              : t('completeDescription');
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
      {error && (
        <p role="alert" className="mt-5 text-base text-danger">
          {errors(error)}
        </p>
      )}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-auto space-y-2 bg-bg pt-4 pb-2 lg:static lg:pt-8">
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
            <Button
              variant="ghost"
              fullWidth
              loading={pending}
              onClick={() => void submit({ step, tagIds: [] })}
            >
              {t('skip')}
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
        {step === 'COMPLETE' && (
          <Link className={buttonClasses({ fullWidth: true, size: 'lg' })} href="/">
            {t('home')}
          </Link>
        )}
      </div>
    </div>
  );
}

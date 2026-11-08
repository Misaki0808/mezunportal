'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ZodIssue } from 'zod';

import {
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPES,
  LANGUAGE_LEVELS,
  parsedCertificationSchema,
  parsedEducationSchema,
  parsedLanguageSchema,
  parsedPositionSchema,
  parsedProfileSchema,
  parsedSkillSchema,
  type CvSection,
} from '@/contracts/cv';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';

type Values = Record<string, unknown>;
type FieldKey =
  | 'headline'
  | 'summary'
  | 'city'
  | 'institution'
  | 'level'
  | 'fieldOfStudy'
  | 'startDate'
  | 'endDate'
  | 'isCurrent'
  | 'company'
  | 'title'
  | 'employmentType'
  | 'description'
  | 'name'
  | 'issuer'
  | 'issuedDate';

/** Bölüm → forma giren alanlar (sırayla). Doğrulama CV hattıyla AYNI şemalardır (sözleşme). */
const SECTION_FIELDS: Record<CvSection, readonly FieldKey[]> = {
  PROFILE: ['headline', 'city', 'summary'],
  EDUCATION: ['institution', 'level', 'fieldOfStudy', 'startDate', 'endDate', 'isCurrent'],
  POSITION: [
    'title',
    'company',
    'employmentType',
    'startDate',
    'endDate',
    'isCurrent',
    'description',
  ],
  LANGUAGE: ['name', 'level'],
  CERTIFICATION: ['name', 'issuer', 'issuedDate'],
  SKILL: ['name'],
};
const REQUIRED: Record<CvSection, readonly FieldKey[]> = {
  PROFILE: [],
  EDUCATION: ['institution'],
  POSITION: ['title', 'company'],
  LANGUAGE: ['name'],
  CERTIFICATION: ['name'],
  SKILL: ['name'],
};
const DATE_FIELDS: readonly FieldKey[] = ['startDate', 'endDate', 'issuedDate'];
const LEVEL_OPTIONS = { EDUCATION: EDUCATION_LEVELS, LANGUAGE: LANGUAGE_LEVELS } as const;

type TextKey = Exclude<FieldKey, 'isCurrent'>;
type State = Record<TextKey, string> & { isCurrent: boolean };

function initialState(values: Values | undefined): State {
  const read = (key: TextKey) => {
    const value = values?.[key];
    return typeof value === 'string' ? value : '';
  };
  return {
    headline: read('headline'),
    summary: read('summary'),
    city: read('city'),
    institution: read('institution'),
    level: read('level'),
    fieldOfStudy: read('fieldOfStudy'),
    startDate: read('startDate'),
    endDate: read('endDate'),
    isCurrent: values?.isCurrent === true,
    company: read('company'),
    title: read('title'),
    employmentType: read('employmentType'),
    description: read('description'),
    name: read('name'),
    issuer: read('issuer'),
    issuedDate: read('issuedDate'),
  } as State;
}

/** Boş metin `null` (şema `nullish` kabul eder); doldurulmuş metin olduğu gibi. */
function candidate(section: CvSection, state: State): unknown {
  const orNull = (value: string) => (value.trim() === '' ? null : value);
  if (section === 'PROFILE') {
    return {
      headline: orNull(state.headline),
      summary: orNull(state.summary),
      city: orNull(state.city),
    };
  }
  if (section === 'EDUCATION') {
    return {
      institution: state.institution,
      level: orNull(state.level),
      fieldOfStudy: orNull(state.fieldOfStudy),
      startDate: orNull(state.startDate),
      endDate: orNull(state.endDate),
      isCurrent: state.isCurrent,
    };
  }
  if (section === 'POSITION') {
    return {
      company: state.company,
      title: state.title,
      employmentType: orNull(state.employmentType),
      startDate: orNull(state.startDate),
      endDate: orNull(state.endDate),
      isCurrent: state.isCurrent,
      description: orNull(state.description),
    };
  }
  if (section === 'LANGUAGE') return { name: state.name, level: orNull(state.level) };
  if (section === 'CERTIFICATION') {
    return { name: state.name, issuer: orNull(state.issuer), issuedDate: orNull(state.issuedDate) };
  }
  return state.name;
}

const SCHEMAS = {
  PROFILE: parsedProfileSchema,
  EDUCATION: parsedEducationSchema,
  POSITION: parsedPositionSchema,
  LANGUAGE: parsedLanguageSchema,
  CERTIFICATION: parsedCertificationSchema,
} as const;

type ErrorKind = 'required' | 'invalid' | 'tooLong' | 'dateOrder';

export type EntryValidation =
  { ok: true; values: Values } | { ok: false; errors: Partial<Record<FieldKey, ErrorKind>> };

function kindOf(issue: ZodIssue, field: FieldKey, state: State): ErrorKind {
  const code = issue.code as string;
  if (
    field === 'endDate' &&
    issue.message === 'VALIDATION_INVALID' &&
    state.startDate &&
    state.endDate
  ) {
    return code === 'custom' ? 'dateOrder' : 'invalid';
  }
  if (code === 'too_big') return 'tooLong';
  if (REQUIRED_BLANK(field, state)) return 'required';
  return 'invalid';
}
function REQUIRED_BLANK(field: FieldKey, state: State): boolean {
  if (field === 'isCurrent') return false;
  return state[field].trim() === '';
}

/** Düzenleme formu durumunu sözleşme şemasından geçirir; alan bazlı hata türü döner. */
export function validateEntry(section: CvSection, state: State): EntryValidation {
  if (section === 'SKILL') {
    const parsed = parsedSkillSchema.safeParse(state.name);
    if (parsed.success) return { ok: true, values: { name: parsed.data } };
    return { ok: false, errors: { name: kindOf(parsed.error.issues[0]!, 'name', state) } };
  }
  const parsed = SCHEMAS[section].safeParse(candidate(section, state));
  if (parsed.success) return { ok: true, values: parsed.data as Values };
  const errors: Partial<Record<FieldKey, ErrorKind>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as FieldKey | undefined;
    if (field && SECTION_FIELDS[section].includes(field))
      errors[field] ??= kindOf(issue, field, state);
  }
  return { ok: false, errors };
}

type Props = {
  section: CvSection;
  initial?: Values;
  submitLabel: string;
  cancelLabel: string;
  pending?: boolean;
  /** Sunucu alan hatası (örn. kayıt reddi); alan altında gösterilmez, formun üstünde `error` ile verilir. */
  error?: string;
  onSubmit: (values: Values) => void;
  onCancel: () => void;
};

/** Profil kalemi düzenleme formu: profil düzenleme ve CV onay ekranındaki “Düzelt” aynı bileşeni kullanır. */
export function EntryEditor({
  section,
  initial,
  submitLabel,
  cancelLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const t = useTranslations('profile');
  const e = useTranslations('profile.entryErrors');
  const [state, setState] = useState<State>(() => initialState(initial));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, ErrorKind>>>({});
  const fields = SECTION_FIELDS[section];

  function set(key: FieldKey, value: string | boolean) {
    setState((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const { [key]: _removed, ...rest } = current;
      void _removed;
      return rest;
    });
  }

  function submit() {
    const result = validateEntry(section, state);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.values);
  }

  const label = (key: FieldKey) =>
    key === 'name' && section === 'SKILL' ? t('fields.skill') : t(`fields.${key}`);
  const err = (key: FieldKey) => (errors[key] ? e(errors[key]!) : undefined);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      {error && (
        <p role="alert" className="text-base text-danger">
          {error}
        </p>
      )}
      {fields.map((key) => {
        const required = REQUIRED[section].includes(key);
        if (key === 'isCurrent') {
          return (
            <Checkbox
              key={key}
              label={t('fields.isCurrent')}
              checked={state.isCurrent}
              onChange={(event) => set('isCurrent', event.target.checked)}
            />
          );
        }
        if (key === 'level') {
          const options = LEVEL_OPTIONS[section as 'EDUCATION' | 'LANGUAGE'];
          return (
            <Field key={key} label={label(key)} error={err(key)}>
              {(control) => (
                <Select
                  {...control}
                  value={state.level}
                  onChange={(event) => set('level', event.target.value)}
                >
                  <option value="">{t('fields.select')}</option>
                  {options.map((value) => (
                    <option key={value} value={value}>
                      {section === 'EDUCATION'
                        ? t(`educationLevels.${value as 'BACHELOR'}`)
                        : t(`languageLevels.${value as 'B2'}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          );
        }
        if (key === 'employmentType') {
          return (
            <Field key={key} label={label(key)} error={err(key)}>
              {(control) => (
                <Select
                  {...control}
                  value={state.employmentType}
                  onChange={(event) => set('employmentType', event.target.value)}
                >
                  <option value="">{t('fields.select')}</option>
                  {EMPLOYMENT_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(`employmentTypes.${value}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          );
        }
        if (key === 'description' || key === 'summary') {
          return (
            <Field key={key} label={label(key)} error={err(key)}>
              {(control) => (
                <Textarea
                  {...control}
                  rows={4}
                  value={state.description}
                  onChange={(event) => set('description', event.target.value)}
                />
              )}
            </Field>
          );
        }
        // Süren kalemin bitişi yoktur (şema da atar); alanı gizlemek yerine devre dışı bırakmak yerine gizliyoruz.
        if (key === 'endDate' && state.isCurrent) return null;
        return (
          <Field
            key={key}
            label={label(key)}
            hint={DATE_FIELDS.includes(key) ? t('fields.dateHint') : undefined}
            error={err(key)}
            required={required}
          >
            {(control) => (
              <Input
                {...control}
                value={state[key as TextKey]}
                inputMode={DATE_FIELDS.includes(key) ? 'numeric' : undefined}
                onChange={(event) => set(key, event.target.value)}
              />
            )}
          </Field>
        );
      })}
      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" fullWidth loading={pending}>
          {submitLabel}
        </Button>
        <Button variant="secondary" fullWidth onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </form>
  );
}

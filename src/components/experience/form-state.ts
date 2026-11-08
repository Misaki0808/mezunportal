import type { ZodIssue } from 'zod';

import {
  experienceDraftTemplateSchema,
  experienceTemplateSchema,
  type EXPERIENCE_TYPES,
  type ExperienceDraftTemplate,
} from '@/contracts/experience';

import { fieldsOf, type ExperienceType, type FieldKey } from './field-map';

/**
 * Form durumu metin tutar (giriş kutuları metindir); sözleşme içeriği `toContent` ile üretilir. Tür
 * değişince önceki türün alanları durumda KALIR (kullanıcı geri dönerse kaybolmaz) ama içeriğe
 * yalnız yeni türün alanları girer: sözleşme yabancı alanı reddeder, sunucu da sütunları temizler.
 */
export type StepState = { title: string; description: string };
export type FormState = {
  type: ExperienceType;
  organizationName: string;
  termYear: string;
  termSeason: string;
  country: string;
  city: string;
  durationWeeks: string;
  pay: string;
  applicationChannel: string;
  processSteps: StepState[];
  interviewQuestions: string[];
  whatLearned: string;
  advice: string;
};

export const DEFAULT_TYPE = 'INTERNSHIP' satisfies (typeof EXPERIENCE_TYPES)[number];

export function emptyState(type: ExperienceType = DEFAULT_TYPE): FormState {
  return {
    type,
    organizationName: '',
    termYear: '',
    termSeason: '',
    country: '',
    city: '',
    durationWeeks: '',
    pay: '',
    applicationChannel: '',
    processSteps: [],
    interviewQuestions: [],
    whatLearned: '',
    advice: '',
  };
}

/** Sunucudaki (taslak) içerikten form durumu. */
export function stateFromContent(content: ExperienceDraftTemplate): FormState {
  const base = emptyState(content.type);
  const read = content as Partial<Record<FieldKey, unknown>>;
  const text = (key: FieldKey) => (read[key] === undefined ? '' : String(read[key]));
  return {
    ...base,
    organizationName: text('organizationName'),
    termYear: text('termYear'),
    termSeason: text('termSeason'),
    country: text('country'),
    city: text('city'),
    durationWeeks: text('durationWeeks'),
    pay: text('pay'),
    applicationChannel: text('applicationChannel'),
    processSteps: Array.isArray(read.processSteps)
      ? (read.processSteps as StepState[]).map((step) => ({
          title: step.title,
          description: step.description,
        }))
      : [],
    interviewQuestions: Array.isArray(read.interviewQuestions)
      ? [...(read.interviewQuestions as string[])]
      : [],
    whatLearned: text('whatLearned'),
    advice: text('advice'),
  };
}

const NUMBER_FIELDS: ReadonlySet<FieldKey> = new Set(['termYear', 'durationWeeks']);

/** Boş alan içeriğe girmez; sayı alanı sayıya çevrilir (sayı değilse ham metin kalır → şema `invalid` der). */
export function toContent(state: FormState): Record<string, unknown> {
  const allowed = fieldsOf(state.type);
  const content: Record<string, unknown> = { type: state.type };
  const scalar: FieldKey[] = [
    'organizationName',
    'termYear',
    'termSeason',
    'country',
    'city',
    'durationWeeks',
    'pay',
    'applicationChannel',
    'whatLearned',
    'advice',
  ];
  for (const key of scalar) {
    if (!allowed.has(key)) continue;
    const raw = (state[key as keyof FormState] as string).trim();
    if (raw === '') continue;
    content[key] = NUMBER_FIELDS.has(key) && /^-?\d+$/.test(raw) ? Number(raw) : raw;
  }
  if (allowed.has('processSteps')) {
    // Tamamen boş adım satırı yok sayılır; yarım dolu satır şemaya gider (alan hatası verir).
    content.processSteps = state.processSteps
      .map((step) => ({ title: step.title.trim(), description: step.description.trim() }))
      .filter((step) => step.title !== '' || step.description !== '');
  }
  if (allowed.has('interviewQuestions')) {
    content.interviewQuestions = state.interviewQuestions
      .map((question) => question.trim())
      .filter((question) => question !== '');
  }
  return content;
}

export type FieldErrorKey = 'required' | 'tooLong' | 'tooShort' | 'invalid' | 'year' | 'weeks';
/** Alan anahtarı → hata türü; liste alanlarında `processSteps.0.title` biçimli anahtar da verilir. */
export type FieldErrors = Record<string, FieldErrorKey>;

/** Zod 4 hata kaydı girdiyi taşımaz; “boş mu, yanlış mı” kullanıcının yazdığına bakılarak ayrılır. */
function isBlank(state: FormState, key: string): boolean {
  const value = (state as unknown as Record<string, unknown>)[key];
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined;
}

function describeIssue(issue: ZodIssue, key: string, state: FormState): FieldErrorKey {
  const code = issue.code as string;
  if (code === 'invalid_type' || code === 'invalid_value') {
    return isBlank(state, key) ? 'required' : 'invalid';
  }
  if (code === 'too_big') {
    if (key === 'termYear') return 'year';
    if (key === 'durationWeeks') return 'weeks';
    return 'tooLong';
  }
  if (code === 'too_small') {
    if (key === 'termYear') return 'year';
    if (key === 'durationWeeks') return 'weeks';
    const origin = (issue as { origin?: string }).origin;
    const minimum = Number((issue as { minimum?: number | bigint }).minimum);
    return origin === 'string' && minimum <= 1 ? 'required' : 'tooShort';
  }
  return 'invalid';
}

export type Validation =
  { ok: true; content: ExperienceDraftTemplate } | { ok: false; errors: FieldErrors };

/** `submit`: gönderme için tam şablon; aksi halde taslak (yalnız tür zorunlu, sınırlar geçerli). */
export function validate(state: FormState, mode: 'draft' | 'submit'): Validation {
  const schema = mode === 'submit' ? experienceTemplateSchema : experienceDraftTemplateSchema;
  const parsed = schema.safeParse(toContent(state));
  if (parsed.success) return { ok: true, content: parsed.data as ExperienceDraftTemplate };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const [head, index, leaf] = issue.path;
    if (typeof head !== 'string') continue;
    const key =
      head === 'processSteps' && typeof index === 'number' && typeof leaf === 'string'
        ? `processSteps.${index}.${leaf}`
        : head === 'interviewQuestions' && typeof index === 'number'
          ? `interviewQuestions.${index}`
          : head;
    errors[key] ??= describeIssue(issue, head, state);
  }
  return { ok: false, errors };
}

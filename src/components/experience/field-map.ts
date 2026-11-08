import { experienceTemplateSchema, type EXPERIENCE_TYPES } from '@/contracts/experience';

/**
 * Tür bazlı şablonun TEK kaynağı sözleşmedir (`experienceTemplateSchema`, D9): hangi alanın hangi türde
 * sorulduğu ve zorunlu olup olmadığı buradan okunur; ekran listeyi kopyalamaz, sözleşme değişince form
 * kendiliğinden değişir. `companyId` şirket sözlüğü (P1-08) gelene kadar ekranda yoktur.
 */
export type ExperienceType = (typeof EXPERIENCE_TYPES)[number];
export type FieldKey =
  | 'organizationName'
  | 'termYear'
  | 'termSeason'
  | 'country'
  | 'city'
  | 'durationWeeks'
  | 'pay'
  | 'applicationChannel'
  | 'processSteps'
  | 'interviewQuestions'
  | 'whatLearned'
  | 'advice';

/** Ekrandaki görüntüleme sırası ve bölüm ayrımı. */
export const FIELD_SECTIONS: readonly { id: 'about' | 'process' | 'story'; fields: FieldKey[] }[] =
  [
    {
      id: 'about',
      fields: [
        'organizationName',
        'termYear',
        'termSeason',
        'country',
        'city',
        'durationWeeks',
        'pay',
      ],
    },
    { id: 'process', fields: ['applicationChannel', 'processSteps', 'interviewQuestions'] },
    { id: 'story', fields: ['whatLearned', 'advice'] },
  ];

type Shape = Record<string, { safeParse: (value: unknown) => { success: boolean } }>;

function shapeOf(type: ExperienceType): Shape {
  const option = experienceTemplateSchema.options.find((item) => item.shape.type.value === type);
  if (!option) throw new Error(`Bilinmeyen deneyim türü: ${type}`);
  return option.shape as unknown as Shape;
}

/** Bu türde sorulan alanlar (sözleşmedeki şema anahtarları). */
export function fieldsOf(type: ExperienceType): ReadonlySet<FieldKey> {
  const keys = new Set(Object.keys(shapeOf(type)));
  const all = FIELD_SECTIONS.flatMap((section) => section.fields);
  return new Set(all.filter((key) => keys.has(key)));
}

/** Gönderme için zorunlu mu? (`undefined`'ı kabul etmeyen alan zorunludur.) */
export function isRequired(type: ExperienceType, key: FieldKey): boolean {
  return !shapeOf(type)[key]?.safeParse(undefined).success;
}

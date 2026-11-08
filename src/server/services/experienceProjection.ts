import 'server-only';

import {
  experienceDetailSchema,
  experienceDraftTemplateSchema,
  type ExperienceDraftTemplate,
} from '@/contracts/experience';
import type { Prisma } from '@/generated/prisma/client';

/** Yazarın yalnız zaten açık ad/kimliği seçilir; iletişim/oturum/CV nesnesi asla yüklenmez. */
export const experienceSelect = {
  id: true,
  authorId: true,
  departmentIdAtWrite: true,
  type: true,
  companyId: true,
  organizationName: true,
  country: true,
  city: true,
  termYear: true,
  termSeason: true,
  durationWeeks: true,
  pay: true,
  applicationChannel: true,
  processSteps: true,
  interviewQuestions: true,
  whatLearned: true,
  advice: true,
  isAnonymous: true,
  status: true,
  moderationNote: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
  department: { select: { faculty: { select: { universityId: true } } } },
} satisfies Prisma.ExperienceSelect;
export type ExperienceRow = Prisma.ExperienceGetPayload<{ select: typeof experienceSelect }>;

/** Boş DB alanları taslakta yok sayılır; tür dışındaki sütunlar çıktıya alınmaz. */
export function experienceContent(row: ExperienceRow): ExperienceDraftTemplate {
  const fields = {
    organizationName: row.organizationName,
    country: row.country,
    city: row.city,
    termYear: row.termYear,
    termSeason: row.termSeason,
    durationWeeks: row.durationWeeks,
    companyId: row.companyId,
    pay: row.pay,
    applicationChannel: row.applicationChannel,
    processSteps: row.processSteps,
    interviewQuestions: row.interviewQuestions,
    whatLearned: row.whatLearned,
    advice: row.advice,
  };
  const common = [
    'organizationName',
    'termYear',
    'termSeason',
    'whatLearned',
    'advice',
    'durationWeeks',
  ] as const;
  const extra: Record<ExperienceRow['type'], readonly (keyof typeof fields)[]> = {
    INTERNSHIP: [
      'country',
      'city',
      'companyId',
      'pay',
      'applicationChannel',
      'processSteps',
      'interviewQuestions',
    ],
    ERASMUS: ['country', 'city', 'applicationChannel', 'processSteps'],
    COMPETITION: ['country', 'city', 'applicationChannel', 'processSteps'],
    HACKATHON: ['country', 'city', 'applicationChannel', 'processSteps'],
    CLUB: ['city', 'processSteps'],
    CERTIFICATE: [],
    GRADUATE_STUDY: ['country', 'city', 'applicationChannel', 'processSteps', 'interviewQuestions'],
    STUDY_ABROAD: ['country', 'city', 'applicationChannel', 'processSteps'],
  };
  return experienceDraftTemplateSchema.parse({
    type: row.type,
    ...Object.fromEntries(
      [...common, ...extra[row.type]]
        .map((key) => [key, fields[key]])
        .filter(([, value]) => value !== null && value !== ''),
    ),
  });
}

/** Anonim kimliği ve karar veren kimliği bu ortak nesneye hiçbir zaman girmez (döküm dahil). */
export function experienceFields(row: ExperienceRow) {
  return {
    id: row.id,
    departmentIdAtWrite: row.departmentIdAtWrite,
    content: experienceContent(row),
    isAnonymous: row.isAnonymous,
    status: row.status,
    moderationNote: row.moderationNote,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
export function projectExperience(row: ExperienceRow) {
  const fields = experienceFields(row);
  return experienceDetailSchema.parse(
    row.isAnonymous
      ? fields
      : {
          ...fields,
          author: row.author ? { id: row.author.id, displayName: row.author.name } : undefined,
        },
  );
}

/** Taslak tam bir görüntüdür; tür değişiminde önceki türün sütunları da temizlenir. */
export function draftColumns(content: ExperienceDraftTemplate) {
  return {
    type: content.type,
    organizationName: content.organizationName ?? null,
    termYear: content.termYear ?? null,
    termSeason: content.termSeason ?? null,
    durationWeeks: content.durationWeeks ?? null,
    whatLearned: content.whatLearned ?? '',
    advice: content.advice ?? '',
    country: 'country' in content ? (content.country ?? null) : null,
    city: 'city' in content ? (content.city ?? null) : null,
    companyId: 'companyId' in content ? (content.companyId ?? null) : null,
    pay: 'pay' in content ? (content.pay ?? null) : null,
    applicationChannel:
      'applicationChannel' in content ? (content.applicationChannel ?? null) : null,
    processSteps: 'processSteps' in content ? (content.processSteps ?? []) : [],
    interviewQuestions: 'interviewQuestions' in content ? (content.interviewQuestions ?? []) : [],
  };
}

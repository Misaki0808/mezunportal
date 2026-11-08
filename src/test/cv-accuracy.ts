import { applyCvSchema, type CvDecisionInput, type ParsedCv } from '@/contracts/cv';
import type { PrismaClient } from '@/generated/prisma/client';
import { normalizeName } from '@/server/rules/dictionary';
import { applyCv, getCvReview, uploadCv } from '@/server/services/cv';
import { processCvParse } from '@/server/services/cv-parse';
import type { CvDeps } from '@/server/services/cv-shared';
import type { Actor } from '@/server/permissions/actor';

import { cvSamplePdf, type CvSample } from './cv-samples';
import { rawForm } from './cv';

/**
 * CV alan doğruluğu ölçümü: örnek CV'yi BÜTÜN hattan (yükleme → iş → onay → uygulama) geçirir ve profilde
 * oluşan kalemleri yer gerçeğiyle karşılaştırır. Karşılaştırma "alan = değer" olgularıyla yapılır:
 * doğruluk = beklenen olguların kaçı profilde doğru; uydurma = profilde olup beklenmeyen olgu oranı.
 * Sahte adaptörle bu YÖNTEM doğrulamasıdır (LLM doğruluğu değil); gerçek adaptör (K-04) aynı ölçümü kullanır.
 */
export type SampleScore = {
  id: string;
  kind: CvSample['kind'];
  expected: number;
  correct: number;
  missing: string[];
  extra: string[];
};

const norm = (value: string | null) => (value ? normalizeName(value) : '');

function facts(cv: ParsedCv): Set<string> {
  const out = new Set<string>();
  for (const [field, value] of Object.entries(cv.profile)) {
    if (value !== null) out.add(`PROFILE|-|${field}=${String(value)}`);
  }
  const add = (section: string, key: string, field: string, value: unknown) => {
    if (value === null || value === undefined || value === false || value === '') return;
    out.add(`${section}|${key}|${field}=${String(value)}`);
  };
  for (const row of cv.education) {
    const key = `${norm(row.institution)}|${row.level ?? ''}`;
    for (const [field, value] of Object.entries(row)) add('EDUCATION', key, field, value);
  }
  for (const row of cv.positions) {
    const key = `${norm(row.company)}|${row.startDate ?? norm(row.title)}`;
    for (const [field, value] of Object.entries(row)) add('POSITION', key, field, value);
  }
  for (const row of cv.languages) {
    for (const [field, value] of Object.entries(row)) add('LANGUAGE', norm(row.name), field, value);
  }
  for (const row of cv.certifications) {
    for (const [field, value] of Object.entries(row))
      add('CERTIFICATION', norm(row.name), field, value);
  }
  for (const name of cv.skills) add('SKILL', norm(name), 'name', name);
  return out;
}

const ym = (year: number | null, month: number | null) =>
  year === null
    ? null
    : month === null
      ? String(year)
      : `${year}-${String(month).padStart(2, '0')}`;

export async function profileAsParsedCv(db: PrismaClient, userId: string): Promise<ParsedCv> {
  const [education, positions, languages, certifications, skills] = await Promise.all([
    db.education.findMany({ where: { userId } }),
    db.position.findMany({ where: { userId } }),
    db.language.findMany({ where: { userId } }),
    db.certification.findMany({ where: { userId } }),
    db.profileTag.findMany({
      where: { profile: { userId }, tag: { kind: 'SKILL' } },
      select: { tag: { select: { label: true } } },
    }),
  ]);
  const profile = await db.profile.findUnique({ where: { userId } });
  return {
    profile: {
      headline: profile?.headline ?? null,
      summary: profile?.summary ?? null,
      city: profile?.city ?? null,
    },
    education: education.map((row) => ({
      institution: row.institution,
      level: row.level,
      fieldOfStudy: row.fieldOfStudy,
      startDate: ym(row.startYear, row.startMonth),
      endDate: ym(row.endYear, row.endMonth),
      isCurrent: row.isCurrent,
    })),
    positions: positions.map((row) => ({
      company: row.companyRaw,
      title: row.titleRaw,
      employmentType: row.employmentType,
      startDate: ym(row.startYear, row.startMonth),
      endDate: ym(row.endYear, row.endMonth),
      isCurrent: row.isCurrent,
      description: row.description,
    })),
    languages: languages.map((row) => ({ name: row.name, level: row.level })),
    certifications: certifications.map((row) => ({
      name: row.name,
      issuer: row.issuer,
      issuedDate: ym(row.issuedYear, row.issuedMonth),
    })),
    skills: skills.map((row) => row.tag.label ?? ''),
  };
}

export async function scoreSample(
  deps: CvDeps,
  actor: Actor,
  sample: CvSample,
): Promise<SampleScore> {
  const upload = await uploadCv(deps, actor, rawForm(cvSamplePdf(sample)));
  await processCvParse(deps, upload.cvUploadId, { retryCount: 0, retryLimit: 2 });
  const review = await getCvReview(deps, actor, upload.cvUploadId);
  await applyCv(
    deps,
    actor,
    applyCvSchema.parse({
      cvUploadId: upload.cvUploadId,
      decisions: review.items.map((item) => ({
        key: item.key,
        section: item.section,
      })) as CvDecisionInput[],
    }),
  );
  const expected = facts(sample.expected);
  const actual = facts(await profileAsParsedCv(deps.db, actor.userId));
  const missing = [...expected].filter((fact) => !actual.has(fact));
  const extra = [...actual].filter((fact) => !expected.has(fact));
  return {
    id: sample.id,
    kind: sample.kind,
    expected: expected.size,
    correct: expected.size - missing.length,
    missing,
    extra,
  };
}

export function accuracyTable(scores: readonly SampleScore[]): string {
  const rows = scores.map((score) => {
    const accuracy = score.expected === 0 ? 1 : score.correct / score.expected;
    return `| ${score.id} | ${score.kind} | ${score.expected} | ${score.correct} | ${(accuracy * 100).toFixed(0)}% | ${score.extra.length} |`;
  });
  return [
    '| Örnek | Tür | Beklenen alan | Doğru alan | Doğruluk | Uydurma alan |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

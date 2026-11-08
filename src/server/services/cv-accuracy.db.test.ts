import { afterAll, describe, expect, it } from 'vitest';

import { createFakeLlm } from '@/server/external/llm/fake';

import { accuracyTable, scoreSample, type SampleScore } from '@/test/cv-accuracy';
import { cvKit, cvUser } from '@/test/cv';
import { CV_SAMPLES } from '@/test/cv-samples';
import { createTestPrisma } from '@/test/db';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

/**
 * 5 sentetik örnek CV (biri LinkedIn PDF dışa aktarımı, biri taranmış) bütün hattan geçer. SAHTE adaptörle bu
 * bir YÖNTEM doğrulamasıdır (yükleme → iş → sözlük → fark → uygulama alanları kaybetmez/uydurmaz); LLM
 * doğruluğu gerçek sağlayıcı adaptörü (K-04) ile aynı ölçümle çıkarılır.
 */
describe('örnek CV alan doğruluğu (sahte adaptör: hat bütünlüğü)', () => {
  const scores: SampleScore[] = [];

  it.each(CV_SAMPLES.map((sample) => [sample.id, sample] as const))('%s', async (_id, sample) => {
    const user = await cvUser(db);
    const kit = cvKit(db);
    const score = await scoreSample(kit.deps, user.actor, sample);
    scores.push(score);
    expect(score.missing).toEqual([]);
    expect(score.extra).toEqual([]);
    expect(score.expected).toBeGreaterThan(0);
  });

  it('tablo üretilir', () => {
    expect(scores).toHaveLength(CV_SAMPLES.length);
    const table = accuracyTable(scores);
    expect(table.split('\n')).toHaveLength(2 + CV_SAMPLES.length);
    console.info(`\n${table}\n`);
  });
});

describe('ölçüm düzeneğinin kendisi (bozuk çıktıyı yakalar)', () => {
  it('alan eksilten ve alan uyduran bir model düşük doğruluk ve uydurma alan olarak görünür', async () => {
    const sample = CV_SAMPLES[0]!;
    const lossy = {
      ...sample.expected,
      positions: sample.expected.positions.map((position) => ({ ...position, endDate: null })),
      skills: [...sample.expected.skills, 'Uydurma Beceri'],
    };
    const llm = createFakeLlm({ scenarios: { [sample.id]: lossy } });
    const user = await cvUser(db);
    const kit = cvKit(db, { llm });
    const score = await scoreSample(kit.deps, user.actor, sample);
    expect(score.correct).toBeLessThan(score.expected);
    expect(score.missing.some((fact) => fact.endsWith('endDate=2024-09'))).toBe(true);
    expect(score.extra).toEqual([expect.stringContaining('Uydurma Beceri')]);
  });
});

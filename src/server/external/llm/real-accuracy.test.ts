import { expect, it } from 'vitest';
import { parsedCvJsonSchema, parsedCvSchema } from '@/contracts/cv';
import { parseLlmEnv } from '@/lib/env';
import { buildRealTestPdf } from '@/test/real-pdf';
import { getPdfTextExtractor, withCvTextRedaction } from '../pdf-text';
import { CV_SYSTEM_INSTRUCTION } from './prompt';
import { createOpenAiCompatibleLlm } from './openai-compatible';

// Her PDF kendi yer gerçeğini taşır; eski sahte-adaptör örneklerinin kısmi PDF metniyle doğruluk uydurulmaz.
const samples = [
  {
    name: 'Jordan Parker',
    text: 'Jordan Parker. Education: Example University, Bachelor of Computer Science, 2019-2023. Work experience: Demo Tech, Software Intern, 2023-06 to 2023-09. Skills: SQL, Python.',
    education: 'Example University',
    company: 'Demo Tech',
    skills: ['SQL', 'Python'],
    dates: ['2019', '2023', '2023-06', '2023-09'],
  },
  {
    name: 'Alex Taylor',
    text: 'Alex Taylor. Education: Fiction University, Bachelor of Business, 2018-2022. Work experience: Sample Labs, Data Analyst, 2022-01 to 2024-01. Skills: Excel, SQL.',
    education: 'Fiction University',
    company: 'Sample Labs',
    skills: ['Excel', 'SQL'],
    dates: ['2018', '2022', '2022-01', '2024-01'],
  },
];

it.skipIf(process.env.RUN_LLM_ACCURACY !== '1' || process.env.LLM_PROVIDER !== 'openai-compatible')(
  'sentetik PDF ile gerçek sağlayıcının alan doğruluğu (isteğe bağlı, CI dışı)',
  async () => {
    const env = parseLlmEnv(process.env);
    const llm = createOpenAiCompatibleLlm({
      baseUrl: env.LLM_BASE_URL!,
      model: env.LLM_MODEL!,
      apiKey: env.LLM_API_KEY,
    });
    const extractor = withCvTextRedaction(getPdfTextExtractor())!;
    const totals: Record<'experience' | 'education' | 'skills' | 'dates', [number, number]> = {
      experience: [0, 0],
      education: [0, 0],
      skills: [0, 0],
      dates: [0, 0],
    };
    for (const sample of samples) {
      // Tek satır bir PDF sayfasının dışına taşarsa metin çıkarıcı kalan alanları görmez.
      const pages = sample.text.split(/(?<=\.)\s+/);
      const text = await extractor.extract(buildRealTestPdf(pages));
      expect(text).toContain(sample.education);
      expect(text).toContain(sample.company);
      for (const skill of sample.skills) expect(text).toContain(skill);
      for (const date of sample.dates) expect(text).toContain(date);
      const masked = await extractor.redact!(text, sample.name);
      expect(masked).toContain(sample.company);
      for (const skill of sample.skills) expect(masked).toContain(skill);
      expect(masked).not.toContain(sample.name);
      const raw = await llm.parseRedactedCv!({
        text: masked,
        instruction: CV_SYSTEM_INSTRUCTION,
        schema: parsedCvJsonSchema(),
        signal: AbortSignal.timeout(90_000),
      });
      const parsed = parsedCvSchema.safeParse(raw);
      expect(parsed.success).toBe(true);
      if (!parsed.success) continue;
      const cv = parsed.data;
      const norm = (s: string | null) => (s ?? '').toLocaleLowerCase('en-US');
      const checks = {
        experience: [cv.positions.some((p) => norm(p.company) === norm(sample.company))],
        education: [cv.education.some((e) => norm(e.institution) === norm(sample.education))],
        skills: sample.skills.map((skill) => cv.skills.some((s) => norm(s) === norm(skill))),
        dates: sample.dates.map((date) =>
          [...cv.education, ...cv.positions].some(
            (row) => row.startDate === date || row.endDate === date,
          ),
        ),
      };
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
        totals[key][0] += checks[key].filter(Boolean).length;
        totals[key][1] += checks[key].length;
      }
    }
    console.info(
      '\n| Alan | Doğru | Yanlış/eksik |\n|---|---:|---:|\n' +
        Object.entries(totals)
          .map(([key, [correct, total]]) => `| ${key} | ${correct} | ${total - correct} |`)
          .join('\n'),
    );
  },
  240_000,
);

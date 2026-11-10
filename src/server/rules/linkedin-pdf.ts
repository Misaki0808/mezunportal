/** Extracts recognizable section boundaries from already-decoded text, without calling a provider.
 * Input is untrusted; callers must not log the result or treat it as approved profile data.
 */
export type LinkedInSections = { experience: string[]; education: string[]; skills: string[] };
const HEADINGS: Readonly<Record<string, keyof LinkedInSections | null>> = {
  deneyim: 'experience',
  experience: 'experience',
  eğitim: 'education',
  education: 'education',
  yetenekler: 'skills',
  beceriler: 'skills',
  skills: 'skills',
  'top skills': 'skills',
  'öne çıkan yetenekler': 'skills',
  languages: null,
  diller: null,
  certifications: null,
  sertifikalar: null,
  summary: null,
  özet: null,
  contact: null,
  iletişim: null,
};
export function splitLinkedInSections(text: string): LinkedInSections {
  const result: LinkedInSections = { experience: [], education: [], skills: [] };
  let current: keyof LinkedInSections | null = null;
  for (const raw of text.slice(0, 200_000).split(/\r?\n/)) {
    const line = raw.trim();
    const key = line.toLocaleLowerCase('tr-TR').replace(/:$/, '').trim();
    if (Object.hasOwn(HEADINGS, key)) {
      current = HEADINGS[key] ?? null;
      continue;
    }
    if (line && current && result[current].length < 500) result[current].push(line);
  }
  return result;
}

import type {
  ExperienceDetail,
  ListMyExperiencesInput,
  ExperiencePage,
} from '@/contracts/experience';
import type { ActionResult } from '@/contracts/result';

/** Anonim yazar bilgisini istemciye taşımadan kullanıcının kendi kayıtlarında arar. */
export async function findAnonymousOwnership(
  experience: ExperienceDetail,
  list: (input: ListMyExperiencesInput) => Promise<ActionResult<ExperiencePage>>,
): Promise<boolean | null> {
  let cursor: string | undefined;
  const visited = new Set<string>();
  do {
    const result = await list({
      status: experience.status,
      limit: 50,
      ...(cursor ? { cursor } : {}),
    }).catch(() => null);
    if (!result?.ok) return null;
    if (result.data.items.some((item) => item.id === experience.id)) return true;
    const next = result.data.nextCursor;
    if (!next) return false;
    if (visited.has(next)) return null;
    visited.add(next);
    cursor = next;
  } while (cursor);
  return false;
}

import { z } from 'zod';

/** Davet listesi hem istemcide hem sunucuda aynı şekilde çözülür. */
export const INVITATION_MAX = 100;
export const invitationTextSchema = z.string().max(30000);

export function parseInvitationEntries(input: string): string[] | null {
  const text = invitationTextSchema.safeParse(input);
  if (!text.success) return null;
  const entries = text.data.split(/[\s,;]+/).filter(Boolean);
  if (entries[0]?.toLowerCase() === 'email' || entries[0]?.toLowerCase() === 'e-posta')
    entries.shift();
  if (
    !entries.length ||
    entries.length > INVITATION_MAX ||
    entries.some((entry) => !z.email().safeParse(entry).success)
  )
    return null;
  return [...new Set(entries.map((entry) => entry.toLowerCase()))];
}

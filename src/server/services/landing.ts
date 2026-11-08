import 'server-only';

import { getDb } from '@/server/db';

/** Küçük gruplar ve ulaşılamayan veriler herkese açık sayaçta sayı olarak gösterilmez. */
export type LandingStats = {
  available: boolean;
  experiences: number | null;
  mentors: number | null;
  meetings: number | null;
};
export function publicLandingCount(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 3 ? value : null;
}

export async function getLandingStats(): Promise<LandingStats> {
  try {
    const db = getDb();
    const [experiences, mentors, meetings] = await Promise.all([
      db.experience.count({ where: { status: 'PUBLISHED' } }),
      db.mentorProfile.count({
        where: {
          isActive: true,
          user: {
            deletedAt: null,
            banned: false,
            memberships: { some: { endedAt: null, verificationStatus: 'VERIFIED' } },
          },
        },
      }),
      db.appointment.count({ where: { status: 'COMPLETED' } }),
    ]);
    return {
      available: true,
      experiences: publicLandingCount(experiences),
      mentors: publicLandingCount(mentors),
      meetings: publicLandingCount(meetings),
    };
  } catch {
    return { available: false, experiences: null, mentors: null, meetings: null };
  }
}

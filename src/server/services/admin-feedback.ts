import 'server-only';
import { readAsAdmin, type AdminDeps } from './admin-access';

/** Ham yanıtlar yalnız güncel yetkisi ve rızası olan, talep edenin bölümünü yöneten yöneticiye çıkar. */
export async function listAdminFeedback(deps: AdminDeps, adminUserId: string, before?: string) {
  return readAsAdmin(deps, adminUserId, 'ANY_ADMIN', async ({ tx, departmentIds }) => {
    const rows = await tx.sessionFeedback.findMany({
      where: {
        ...(before ? { id: { lt: before } } : {}),
        appointment: {
          mentee: {
            memberships: {
              some: {
                endedAt: null,
                verificationStatus: 'VERIFIED',
                departmentId: { in: departmentIds },
              },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
      take: 51,
      select: {
        id: true,
        authorId: true,
        happened: true,
        helpful: true,
        answerOne: true,
        answerTwo: true,
        answerThree: true,
        ratingHalf: true,
        note: true,
        createdAt: true,
        appointment: {
          select: {
            mentorId: true,
            mentor: { select: { name: true } },
            mentee: { select: { name: true } },
          },
        },
      },
    });
    return {
      items: rows.slice(0, 50).map((row) => ({
        id: row.id,
        happened: row.happened,
        helpful: row.helpful,
        answers: [row.answerOne, row.answerTwo, row.answerThree],
        ratingHalf: row.ratingHalf,
        note: row.note,
        createdAt: row.createdAt,
        role: row.authorId === row.appointment.mentorId ? ('MENTOR' as const) : ('MENTEE' as const),
        mentorName: row.appointment.mentor.name,
        studentName: row.appointment.mentee.name,
      })),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  });
}

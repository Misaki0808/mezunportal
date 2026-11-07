import 'server-only';

import {
  DATA_EXPORT_FORMAT_VERSION,
  exportedProfileSchema,
  type DataExport,
} from '@/contracts/privacy';
import type { PrismaClient } from '@/generated/prisma/client';
import { codedNotFound } from '@/lib/errors';

import { loadVisibilityLevels } from './privacy';

/**
 * Veri dökümü (KVKK m. 11): YALNIZ kullanıcının kendi verisi. İletişim taleplerinde karşı taraf yalnız
 * kullanıcı kimliğiyle (requesterId/targetId) tanımlanır, adı bile dökülmez; karşı tarafın e-posta/telefonu dökümde yoktur (açık `select`). Tarihler ISO metni.
 */
type RequestRow = {
  id: string;
  requesterId: string;
  targetId: string;
  fields: DataExport['contactRequests']['sent'][number]['fields'];
  message: string | null;
  status: DataExport['contactRequests']['sent'][number]['status'];
  createdAt: Date;
  updatedAt: Date;
  decidedAt: Date | null;
  closedAt: Date | null;
};

function exportRequest(row: RequestRow): DataExport['contactRequests']['sent'][number] {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

export async function buildDataExport(
  db: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataExport> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      deletedAt: true,
      profile: {
        select: {
          id: true,
          headline: true,
          summary: true,
          city: true,
          goals: true,
          socialLinks: true,
          linkedinUrl: true,
          completionScore: true,
          onboardingStep: true,
          completedSteps: true,
          skippedSteps: true,
          mentorInterested: true,
          cvUpdatedAt: true,
          lastFreshnessPromptAt: true,
          lastStillThereCheckAt: true,
          createdAt: true,
          updatedAt: true,
          tags: {
            select: {
              createdAt: true,
              updatedAt: true,
              tag: { select: { id: true, kind: true, slug: true } },
            },
            orderBy: { tagId: 'asc' },
          },
        },
      },
      memberships: {
        select: {
          id: true,
          role: true,
          verificationStatus: true,
          entryYear: true,
          graduationYear: true,
          createdAt: true,
          endedAt: true,
          department: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      consents: {
        select: { documentType: true, version: true, granted: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      sentContactRequests: {
        select: {
          id: true,
          requesterId: true,
          targetId: true,
          fields: true,
          message: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          decidedAt: true,
          closedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      receivedContactRequests: {
        select: {
          id: true,
          requesterId: true,
          targetId: true,
          fields: true,
          message: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          decidedAt: true,
          closedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!user || user.deletedAt) throw codedNotFound('RESOURCE_NOT_FOUND');
  const iso = (date: Date | null) => (date ? date.toISOString() : null);
  const levels = (await loadVisibilityLevels(db, [userId])).get(userId) ?? new Map();

  return {
    formatVersion: DATA_EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      createdAt: user.createdAt.toISOString(),
    },
    profile: user.profile
      ? exportedProfileSchema.parse({
          ...user.profile,
          cvUpdatedAt: iso(user.profile.cvUpdatedAt),
          lastFreshnessPromptAt: iso(user.profile.lastFreshnessPromptAt),
          lastStillThereCheckAt: iso(user.profile.lastStillThereCheckAt),
          createdAt: user.profile.createdAt.toISOString(),
          updatedAt: user.profile.updatedAt.toISOString(),
          tags: user.profile.tags.map(({ tag, createdAt, updatedAt }) => ({
            ...tag,
            assignedAt: createdAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
          })),
        })
      : null,
    memberships: user.memberships.map(({ department, ...membership }) => ({
      ...membership,
      departmentName: department.name,
      createdAt: membership.createdAt.toISOString(),
      endedAt: iso(membership.endedAt),
    })),
    consents: user.consents.map((consent) => ({
      ...consent,
      createdAt: consent.createdAt.toISOString(),
    })),
    fieldVisibility: [...levels].map(([field, level]) => ({ field, level })),
    contactRequests: {
      sent: user.sentContactRequests.map(exportRequest),
      received: user.receivedContactRequests.map(exportRequest),
    },
  };
}

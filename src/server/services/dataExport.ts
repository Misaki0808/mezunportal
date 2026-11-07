import 'server-only';

import { DATA_EXPORT_FORMAT_VERSION, type DataExport } from '@/contracts/privacy';
import type { PrismaClient } from '@/generated/prisma/client';
import { codedNotFound } from '@/lib/errors';

import { loadVisibilityLevels } from './privacy';

/**
 * Veri dökümü (KVKK m. 11): YALNIZ kullanıcının kendi verisi. İletişim taleplerinde karşı taraf yalnız
 * kimlik + adla görünür; karşı tarafın e-posta/telefonu dökümde yoktur (açık `select`). Tarihler ISO metni.
 */
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
          fields: true,
          message: true,
          status: true,
          createdAt: true,
          decidedAt: true,
          closedAt: true,
          target: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      receivedContactRequests: {
        select: {
          id: true,
          fields: true,
          message: true,
          status: true,
          createdAt: true,
          decidedAt: true,
          closedAt: true,
          requester: { select: { id: true, name: true } },
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
      sent: user.sentContactRequests.map(({ target, ...row }) => ({
        ...row,
        counterpart: { userId: target.id, name: target.name },
        createdAt: row.createdAt.toISOString(),
        decidedAt: iso(row.decidedAt),
        closedAt: iso(row.closedAt),
      })),
      received: user.receivedContactRequests.map(({ requester, ...row }) => ({
        ...row,
        counterpart: { userId: requester.id, name: requester.name },
        createdAt: row.createdAt.toISOString(),
        decidedAt: iso(row.decidedAt),
        closedAt: iso(row.closedAt),
      })),
    },
  };
}

import 'server-only';

import {
  DATA_EXPORT_FORMAT_VERSION,
  exportedProfileSchema,
  type DataExport,
} from '@/contracts/privacy';
import type { PrismaClient } from '@/generated/prisma/client';
import { codedNotFound } from '@/lib/errors';

import { toYearMonth } from './cv-shared';
import { loadVisibilityLevels } from './privacy';
import { experienceFields, experienceSelect } from './experienceProjection';

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
      experiences: { select: experienceSelect, orderBy: { id: 'asc' } },
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
  const cv = await loadCvExport(db, userId, iso);
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
    experiences: user.experiences.map((row) => ({
      ...experienceFields(row),
      publishedAt: iso(row.publishedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
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
    cv,
  };
}

/**
 * CV ve profil kalemleri. Açık `select`: dosya anahtarı, sözlük kimlikleri ve başka kullanıcıya ait hiçbir alan
 * dökülmez. Onay bekleyen ayrıştırma önerisi kullanıcının kendi CV'sinden türediği için dahildir.
 */
async function loadCvExport(
  db: PrismaClient,
  userId: string,
  iso: (date: Date | null) => string | null,
): Promise<DataExport['cv']> {
  const [uploads, education, positions, languages, certifications, skills, invitations] =
    await Promise.all([
      db.cvUpload.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          errorCode: true,
          pageCount: true,
          storageKey: true,
          parsedJson: true,
          createdAt: true,
          appliedAt: true,
        },
      }),
      db.education.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      db.position.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      db.language.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      db.certification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      db.profileTag.findMany({
        where: { profile: { userId }, tag: { kind: 'SKILL' } },
        orderBy: { createdAt: 'asc' },
        select: { tagId: true, tag: { select: { label: true } } },
      }),
      db.experienceInvitation.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { positionId: true, status: true },
      }),
    ]);
  const entry = <T extends { manuallyEdited: boolean; source: string }>(row: T) => ({
    source: row.source,
    manuallyEdited: row.manuallyEdited,
  });
  return {
    uploads: uploads.map((row) => ({
      id: row.id,
      status: row.status,
      errorCode: row.errorCode,
      pageCount: row.pageCount,
      hasFile: row.storageKey !== null,
      createdAt: row.createdAt.toISOString(),
      appliedAt: iso(row.appliedAt),
      pendingParsedCv: row.parsedJson,
    })),
    education: education.map((row) => ({
      id: row.id,
      institution: row.institution,
      level: row.level,
      fieldOfStudy: row.fieldOfStudy,
      startDate: toYearMonth(row.startYear, row.startMonth),
      endDate: toYearMonth(row.endYear, row.endMonth),
      isCurrent: row.isCurrent,
      ...entry(row),
    })),
    positions: positions.map((row) => ({
      id: row.id,
      company: row.companyRaw,
      title: row.titleRaw,
      employmentType: row.employmentType,
      startDate: toYearMonth(row.startYear, row.startMonth),
      endDate: toYearMonth(row.endYear, row.endMonth),
      isCurrent: row.isCurrent,
      description: row.description,
      ...entry(row),
    })),
    languages: languages.map((row) => ({
      id: row.id,
      name: row.name,
      level: row.level,
      ...entry(row),
    })),
    certifications: certifications.map((row) => ({
      id: row.id,
      name: row.name,
      issuer: row.issuer,
      issuedDate: toYearMonth(row.issuedYear, row.issuedMonth),
      ...entry(row),
    })),
    skills: skills.map((row) => ({ id: row.tagId, name: row.tag.label })),
    experienceInvitations: invitations,
  };
}

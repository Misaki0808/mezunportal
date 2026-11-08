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
  source: 'PROFILE' | 'JOB_POSTING' | 'SEEKER_PROFILE';
  sourceTitle: string | null;
  sourceOrganization: string | null;
  fields: DataExport['contactRequests']['sent'][number]['fields'];
  message: string | null;
  status: DataExport['contactRequests']['sent'][number]['status'];
  createdAt: Date;
  updatedAt: Date;
  decidedAt: Date | null;
  closedAt: Date | null;
};

/** D7: ilan kaynaklı ve `APPROVED` olmayan GİDEN talepte hedef kimliği dökülmez (onaydan önce açılmaz). */
function exportRequest(
  row: RequestRow,
  userId: string,
): DataExport['contactRequests']['sent'][number] {
  const { source, sourceTitle, sourceOrganization, ...rest } = row;
  const hidden = source !== 'PROFILE' && row.requesterId === userId && row.status !== 'APPROVED';
  return {
    ...rest,
    targetId: hidden ? null : row.targetId,
    origin:
      source !== 'PROFILE' && sourceTitle !== null && sourceOrganization !== null
        ? { title: sourceTitle, organization: sourceOrganization }
        : null,
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
      companyFollows: {
        select: { companyId: true, sectorId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
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
          seekingInternship: true,
          seekingTermYear: true,
          seekingTermSeason: true,
          seekerViewCount: true,
          hiringDeclaredAt: true,
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
          source: true,
          sourceTitle: true,
          sourceOrganization: true,
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
          source: true,
          sourceTitle: true,
          sourceOrganization: true,
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
  const appointments = await loadAppointmentExport(db, userId);
  const contribution = await loadContributionExport(db, userId, iso);
  const faq = await loadFaqExport(db, userId, iso);
  const jobPostings = await loadJobPostingExport(db, userId, iso);
  const matchRows = await db.jobMatch.findMany({
    where: { userId },
    select: { postingId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const jobMatches = matchRows.map((row) => ({
    postingId: row.postingId,
    createdAt: row.createdAt.toISOString(),
  }));
  const cvReviews = await db.cvReviewRequest.findMany({
    where: { OR: [{ studentId: userId }, { mentorId: userId }] },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      studentId: true,
      mentorId: true,
      status: true,
      note: true,
      comment: true,
      createdAt: true,
      expiresAt: true,
      answeredAt: true,
      helpfulAt: true,
    },
  });
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
      appliedMonth: row.appliedMonth,
      publishedAt: iso(row.publishedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    companyFollows: user.companyFollows.map((follow) => ({
      ...follow,
      createdAt: follow.createdAt.toISOString(),
    })),
    profile: user.profile
      ? exportedProfileSchema.parse({
          ...user.profile,
          hiringDeclaredAt: iso(user.profile.hiringDeclaredAt),
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
      sent: user.sentContactRequests.map((row) => exportRequest(row, userId)),
      received: user.receivedContactRequests.map((row) => exportRequest(row, userId)),
    },
    cv,
    appointments,
    contribution,
    faq,
    jobPostings,
    jobMatches,
    cvReviewRequests: cvReviews.map((row) => ({
      id: row.id,
      role: row.studentId === userId ? ('STUDENT' as const) : ('MENTOR' as const),
      counterpartId: row.studentId === userId ? row.mentorId : row.studentId,
      status: row.status,
      note: row.note,
      comment: row.comment,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      answeredAt: iso(row.answeredAt),
      helpfulAt: iso(row.helpfulAt),
    })),
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

/** Kendi randevuların (mentor ya da öğrenci olarak). Karşı taraf yalnız kimlik; öğrenci notu yalnız yazanda. */
async function loadAppointmentExport(
  db: PrismaClient,
  userId: string,
): Promise<DataExport['appointments']> {
  const rows = await db.appointment.findMany({
    where: { OR: [{ mentorId: userId }, { menteeId: userId }] },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      mentorId: true,
      menteeId: true,
      feedbacks: {
        where: { authorId: userId },
        select: { happened: true, helpful: true, note: true, createdAt: true },
      },
      startsAt: true,
      endsAt: true,
      mode: true,
      status: true,
      menteeNote: true,
      location: true,
      meetUrl: true,
      decisionNote: true,
      cancelReason: true,
      createdAt: true,
    },
  });
  return rows.map((row) => {
    const role = row.mentorId === userId ? ('MENTOR' as const) : ('MENTEE' as const);
    return {
      id: row.id,
      role,
      counterpartId: role === 'MENTOR' ? row.menteeId : row.mentorId,
      feedback: row.feedbacks[0]
        ? { ...row.feedbacks[0], createdAt: row.feedbacks[0].createdAt.toISOString() }
        : null,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      mode: row.mode,
      status: row.status,
      note: role === 'MENTEE' ? row.menteeNote : null,
      location: row.location,
      meetUrl: row.meetUrl,
      reason: row.decisionNote ?? row.cancelReason,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/** Katkı puanı: kaynak içerik ve karşı taraf kimliği çıkmaz (anonim deneyim bağı, üçüncü kişi). */
async function loadContributionExport(
  db: PrismaClient,
  userId: string,
  iso: (date: Date | null) => string | null,
): Promise<DataExport['contribution']> {
  const [entries, badges, flags] = await Promise.all([
    db.pointEntry.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
      select: {
        action: true,
        basePoints: true,
        multiplierPercent: true,
        points: true,
        status: true,
        eventAt: true,
        createdAt: true,
        revokedReason: true,
      },
    }),
    db.userBadge.findMany({
      where: { userId },
      orderBy: { awardedAt: 'asc' },
      select: { kind: true, awardedAt: true, revokedAt: true },
    }),
    db.suspicionFlag.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
      select: { rule: true, status: true, createdAt: true, decidedAt: true },
    }),
  ]);
  return {
    entries: entries.map((row) => ({
      ...row,
      eventAt: row.eventAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    badges: badges.map((row) => ({
      kind: row.kind,
      awardedAt: row.awardedAt.toISOString(),
      revokedAt: iso(row.revokedAt),
    })),
    suspicionFlags: flags.map((row) => ({
      rule: row.rule,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      decidedAt: iso(row.decidedAt),
    })),
  };
}

/** SSS: yalnız kullanıcının kendi soruları ve cevapları (karşı tarafın kimliği ya da diğer cevaplar çıkmaz). */
async function loadFaqExport(
  db: PrismaClient,
  userId: string,
  iso: (date: Date | null) => string | null,
): Promise<DataExport['faq']> {
  const [requests, answers] = await Promise.all([
    db.faqRequest.findMany({
      where: { askerId: userId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        question: true,
        status: true,
        decisionNote: true,
        createdAt: true,
        decidedAt: true,
      },
    }),
    db.faqAnswer.findMany({
      where: { mentorId: userId },
      orderBy: { id: 'asc' },
      select: { id: true, body: true, isSelected: true, createdAt: true },
    }),
  ]);
  return {
    requests: requests.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      decidedAt: iso(row.decidedAt),
    })),
    answers: answers.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  };
}

/** İlanlar (P2-04): yalnız kullanıcının KENDİ ilanları (içerik, durum, ret gerekçesi). Moderatör, raportör ve başkası yok. */
async function loadJobPostingExport(
  db: PrismaClient,
  userId: string,
  iso: (date: Date | null) => string | null,
): Promise<DataExport['jobPostings']> {
  const rows = await db.jobPosting.findMany({
    where: { authorId: userId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      kind: true,
      title: true,
      organizationName: true,
      location: true,
      isRemote: true,
      description: true,
      applyMethod: true,
      applyUrl: true,
      deadlineOn: true,
      status: true,
      moderationNote: true,
      targetGrades: true,
      tags: { select: { tagId: true } },
      createdAt: true,
      publishedAt: true,
    },
  });
  return rows.map(({ tags, ...row }) => ({
    ...row,
    tagIds: tags.map((tag) => tag.tagId),
    deadlineOn: row.deadlineOn ? row.deadlineOn.toISOString().slice(0, 10) : null,
    createdAt: row.createdAt.toISOString(),
    publishedAt: iso(row.publishedAt),
  }));
}

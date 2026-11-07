import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Veritabanlı testler için yalıtılmış örnek veri. Her çağrı benzersiz adlarla kendi kayıtlarını açar;
 * bu yüzden testler birbirini bozmaz ve temizlik gerekmez (test veritabanı her koşuda sıfırlanır;
 * `AdminAuditLog` zaten silinemez). Gerçek kişi verisi yok: e-postalar `.local` alan adındadır.
 */
const runId = Math.random().toString(36).slice(2, 8);
let counter = 0;
export const unique = (prefix: string) => `${prefix}-${runId}-${++counter}`;

export type Institution = {
  universityId: string;
  /** Fakülte A: A1 ve A2 bölümleri. */
  facultyA: string;
  /** Fakülte B: B1 bölümü (başka fakülte). */
  facultyB: string;
  deptA1: string;
  deptA2: string;
  deptB1: string;
};

export async function createInstitution(prisma: PrismaClient): Promise<Institution> {
  const university = await prisma.university.create({
    data: {
      name: unique('Üni'),
      shortName: unique('Ü'),
      studentEmailDomains: [],
      staffEmailDomains: [],
      faculties: {
        create: [
          {
            name: 'Fakülte A',
            departments: {
              create: [
                { name: 'Bölüm A1', code: 'A1' },
                { name: 'Bölüm A2', code: 'A2' },
              ],
            },
          },
          { name: 'Fakülte B', departments: { create: [{ name: 'Bölüm B1', code: 'B1' }] } },
        ],
      },
    },
    select: {
      id: true,
      faculties: {
        select: { id: true, name: true, departments: { select: { id: true, code: true } } },
      },
    },
  });
  const facultyA = university.faculties.find((faculty) => faculty.name === 'Fakülte A');
  const facultyB = university.faculties.find((faculty) => faculty.name === 'Fakülte B');
  const dept = (code: string) => {
    const found = university.faculties
      .flatMap((faculty) => faculty.departments)
      .find((department) => department.code === code);
    if (!found) throw new Error(`Fixture bölümü yok: ${code}`);
    return found.id;
  };
  if (!facultyA || !facultyB) throw new Error('Fixture fakültesi yok');
  return {
    universityId: university.id,
    facultyA: facultyA.id,
    facultyB: facultyB.id,
    deptA1: dept('A1'),
    deptA2: dept('A2'),
    deptB1: dept('B1'),
  };
}

export async function createUser(
  prisma: PrismaClient,
  overrides: {
    banned?: boolean;
    banExpires?: Date | null;
    deletedAt?: Date | null;
    name?: string;
  } = {},
): Promise<string> {
  const key = unique('kullanici');
  const user = await prisma.user.create({
    data: {
      name: overrides.name ?? 'Test Kullanıcı',
      email: `${key}@test.mezunportal.local`,
      emailVerified: true,
      banned: overrides.banned ?? false,
      banExpires: overrides.banExpires ?? null,
      deletedAt: overrides.deletedAt ?? null,
    },
    select: { id: true },
  });
  return user.id;
}

const METHOD_BY_ROLE = {
  STUDENT: 'STUDENT_EMAIL',
  ACADEMIC: 'STAFF_EMAIL',
  ALUMNI: 'GRADUATION_DOCUMENT',
} as const;

export async function addMembership(
  prisma: PrismaClient,
  input: {
    userId: string;
    departmentId: string;
    role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC';
    status?: 'PENDING' | 'VERIFIED' | 'REJECTED';
    endedAt?: Date | null;
    entryYear?: number | null;
    graduationYear?: number | null;
    verifiedById?: string;
  },
): Promise<string> {
  const status = input.status ?? 'VERIFIED';
  const method = METHOD_BY_ROLE[input.role];
  // Belge ile doğrulanan mezun üyelik, doğrulayan yönetici ister (veritabanı kısıtı).
  const needsVerifier = status === 'VERIFIED' && method === 'GRADUATION_DOCUMENT';
  const verifiedById = needsVerifier
    ? (input.verifiedById ?? (await createUser(prisma)))
    : (input.verifiedById ?? null);
  const membership = await prisma.membership.create({
    data: {
      userId: input.userId,
      departmentId: input.departmentId,
      role: input.role,
      verificationStatus: status,
      verificationMethod: method,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
      verifiedById,
      endedAt: input.endedAt ?? null,
      entryYear: input.entryYear ?? null,
      graduationYear: input.graduationYear ?? null,
    },
    select: { id: true },
  });
  return membership.id;
}

export async function addGrant(
  prisma: PrismaClient,
  input: {
    userId: string;
    scope: 'SYSTEM' | 'FACULTY' | 'DEPARTMENT';
    facultyId?: string;
    departmentId?: string;
    grantedById?: string;
    revoked?: boolean;
  },
): Promise<string> {
  const grantedById = input.grantedById ?? (await createUser(prisma));
  const grant = await prisma.adminGrant.create({
    data: {
      userId: input.userId,
      scope: input.scope,
      facultyId: input.facultyId ?? null,
      departmentId: input.departmentId ?? null,
      grantedById,
      revokedAt: input.revoked ? new Date() : null,
      revokedById: input.revoked ? grantedById : null,
    },
    select: { id: true },
  });
  return grant.id;
}

export async function addMentorProfile(
  prisma: PrismaClient,
  userId: string,
  overrides: { isActive?: boolean } = {},
): Promise<void> {
  await prisma.mentorProfile.create({
    data: {
      userId,
      isActive: overrides.isActive ?? true,
      monthlyCapacity: 4,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
    },
  });
}

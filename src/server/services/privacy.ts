import 'server-only';

import {
  CONTACT_FIELDS,
  CURRENT_CONSENT_VERSIONS,
  DEFAULT_FIELD_VISIBILITY,
  type ConsentState,
  type ContactField,
  type FieldVisibilitySettings,
  type VisibilityLevel,
} from '@/contracts/privacy';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { codedForbidden, codedValidation } from '@/lib/errors';

import { computeConsentState, consentDecisionError, type ConsentVersions } from '../rules/consent';
import { getStorage, type StorageAdapter } from '../external/storage';
import { eraseProfilePhoto } from './profile-photo-erasure';
import { revokeSeekerVisibility } from './seeker-visibility';

export type PrivacyClient = Pick<
  Prisma.TransactionClient,
  'consent' | 'fieldVisibility' | 'profile' | 'contactRequest'
>;

export async function getConsentState(
  db: PrivacyClient,
  userId: string,
  versions: ConsentVersions = CURRENT_CONSENT_VERSIONS,
): Promise<ConsentState> {
  const records = await db.consent.findMany({
    where: { userId },
    select: { documentType: true, version: true, granted: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return computeConsentState(records, versions);
}

/** Kararları doğrular (hepsi geçerliyse) ve her birini YENİ satır olarak ekler; güncel durumu döner. */
export async function recordConsents(
  db: PrismaClient,
  userId: string,
  decisions: readonly {
    documentType: ConsentState['documents'][number]['documentType'];
    version: string;
    granted: boolean;
  }[],
  versions: ConsentVersions = CURRENT_CONSENT_VERSIONS,
  photoStorage?: StorageAdapter,
): Promise<ConsentState> {
  for (const decision of decisions) {
    const error = consentDecisionError(decision, versions);
    if (error) throw codedValidation(error);
  }
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
    // Rıza geri alımı yükleme ve hesap silmeyle aynı kilitte sıralanır.
    if (decisions.some((d) => d.documentType === 'PROFILE_PHOTO_VISIBILITY' && !d.granted)) {
      const photo = await tx.profilePhoto.findUnique({ where: { userId } });
      if (photo) await eraseProfilePhoto(tx, photoStorage ?? getStorage(), userId);
    }
    await tx.consent.createMany({ data: decisions.map((d) => ({ userId, ...d })) });
    if (decisions.some((d) => d.documentType === 'JOB_SEEKER_VISIBILITY' && !d.granted))
      await revokeSeekerVisibility(tx, userId, new Date());
  });
  return getConsentState(db, userId, versions);
}

/** Uygulama kullanımı için zorunlu onaylar tamam mı? (Proxy/yerleşim yeniden onaya yönlendirir.) */
export async function needsConsent(db: PrivacyClient, userId: string): Promise<boolean> {
  return (await getConsentState(db, userId)).blocking;
}

/**
 * Kişisel veri işleyen yönetim işleri (belge kuyruğu, belge dosyası, karar) zorunlu onayı güncel olmayan
 * kullanıcıya kapalıdır (tur bulgusu #11): `CONSENT_REQUIRED`. Sayfa düzeyi kapı `PrivacyGuard`'dır; bu
 * ikinci kilit, sayfayı atlayıp eylemi doğrudan çağırana karşıdır.
 */
export async function requireConsent(db: Pick<PrivacyClient, 'consent'>, userId: string) {
  const records = await db.consent.findMany({
    where: { userId },
    select: { documentType: true, version: true, granted: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (computeConsentState(records, CURRENT_CONSENT_VERSIONS).blocking) {
    throw codedForbidden('CONSENT_REQUIRED');
  }
}

export async function loadVisibilityLevels(
  db: Pick<Prisma.TransactionClient, 'fieldVisibility'>,
  userIds: readonly string[],
): Promise<Map<string, Map<ContactField, VisibilityLevel>>> {
  const rows = await db.fieldVisibility.findMany({
    where: { userId: { in: [...userIds] } },
    select: { userId: true, field: true, level: true },
  });
  const result = new Map<string, Map<ContactField, VisibilityLevel>>();
  for (const row of rows) {
    const levels = result.get(row.userId) ?? new Map<ContactField, VisibilityLevel>();
    levels.set(row.field, row.level);
    result.set(row.userId, levels);
  }
  return result;
}

export async function getFieldVisibility(
  db: PrivacyClient,
  userId: string,
): Promise<FieldVisibilitySettings> {
  const chosen = (await loadVisibilityLevels(db, [userId])).get(userId) ?? new Map();
  return {
    fields: CONTACT_FIELDS.map((field) => ({
      field,
      level: chosen.get(field) ?? DEFAULT_FIELD_VISIBILITY[field],
      isDefault: !chosen.has(field),
    })),
  };
}

export async function setFieldVisibility(
  db: PrivacyClient,
  userId: string,
  input: { field: ContactField; level: VisibilityLevel },
): Promise<FieldVisibilitySettings> {
  await db.fieldVisibility.upsert({
    where: { userId_field: { userId, field: input.field } },
    create: { userId, field: input.field, level: input.level },
    update: { level: input.level },
  });
  return getFieldVisibility(db, userId);
}

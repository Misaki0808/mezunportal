import 'server-only';

import {
  CV_PARSE_WINDOW_MS,
  parsedCvSchema,
  type ApplyCvOutput,
  type CvAvailability,
  type CvDecision,
  type CvReview,
  type CvReviewItem,
  type CvStatusOutput,
  type CvUploadForm,
  type CvUploadOutput,
  type DiscardCvOutput,
  type ExperienceInvitationsOutput,
  type ParsedCv,
  type ParsedPosition,
  PROFILE_FIELDS,
} from '@/contracts/cv';
import { Prisma } from '@/generated/prisma/client';
import {
  codedConflict,
  codedNotFound,
  codedRateLimited,
  codedValidation,
  isCodedError,
} from '@/lib/errors';

import { newCvKey } from '../external/storage';
import type { Actor } from '../permissions/actor';
import {
  computeCvDiff,
  type CvProposal,
  type CvSnapshot,
  type DiffItem,
  type PositionEntry,
} from '../rules/cvDiff';
import { hasActiveConsent } from '../rules/consent';
import { normalizeName } from '../rules/dictionary';
import { checkCvPdf } from '../rules/pdf';
import {
  buildDictionaryLookup,
  lookupMatch,
  recordUnmatched,
  type DictionaryLookup,
} from './cv-dictionary';
import {
  DbNull,
  lockUser,
  logCv,
  nowOf,
  removeUploadFiles,
  toYearMonth,
  type CvDeps,
  type Tx,
} from './cv-shared';
import { emitEvent, emitProfileThresholds, subjectFromActor } from './event';
import { storedScore, syncCompletionScore } from './profile';
import { attachSkill, ensureProfile } from './profile-skills';
import { consumeRateLimit, peekRateLimit } from './rateLimit';

/**
 * CV ayrıştırma servisi (P1-05; docs/architecture.md "CV ayrıştırma hattı"). Eylemler girdiyi Zod ile
 * doğrulamıştır; burada SUNUCU yeniden denetler (rıza, sağlayıcı, günlük sınır, PDF içeriği) ve kullanıcı
 * kimliği yalnız `actor`'dan gelir. LLM çıktısı yalnız ÖNERİDİR: bu dosyadaki hiçbir yol kullanıcının açık
 * kararı olmadan profil kalemi yazmaz, ve hiçbir yol rol/yetki/üyelik alanına dokunmaz.
 */

const cvParseRule = (dailyLimit: number) => ({
  name: 'cv-parse',
  limit: dailyLimit,
  windowMs: CV_PARSE_WINDOW_MS,
});

const IN_FLIGHT = ['QUEUED', 'PARSING'] as const;

async function transferConsentGranted(db: Pick<Tx, 'consent'>, userId: string): Promise<boolean> {
  const records = await db.consent.findMany({
    where: { userId },
    select: { documentType: true, version: true, granted: true, createdAt: true },
  });
  return hasActiveConsent(records, 'CROSS_BORDER_TRANSFER');
}

// ---------------------------------------------------------------------------------------------
// Kullanılabilirlik ve yükleme
// ---------------------------------------------------------------------------------------------

/** Yükleme neden kapalı? İlk geçerli sebep döner (sağlayıcı → rıza → işlenen CV → günlük sınır). */
export async function getCvAvailability(deps: CvDeps, actor: Actor): Promise<CvAvailability> {
  const now = nowOf(deps);
  const rule = cvParseRule(deps.dailyLimit);
  const { remaining } = await peekRateLimit(deps.db, rule, actor.userId, now);
  const base = { dailyLimit: deps.dailyLimit, remainingToday: remaining };
  if (!deps.llm) return { ...base, available: false, reason: 'PROVIDER_NOT_CONFIGURED' };
  if (!(await transferConsentGranted(deps.db, actor.userId))) {
    return { ...base, available: false, reason: 'TRANSFER_CONSENT_REQUIRED' };
  }
  const inFlight = await deps.db.cvUpload.findFirst({
    where: { userId: actor.userId, status: { in: [...IN_FLIGHT] } },
    select: { id: true },
  });
  if (inFlight) return { ...base, available: false, reason: 'ALREADY_PROCESSING' };
  if (remaining < 1) return { ...base, available: false, reason: 'DAILY_LIMIT_REACHED' };
  return { ...base, available: true, reason: null };
}

/**
 * CV yükle: önkoşullar (sağlayıcı, yurt dışı rızası) → içerik denetimi → günlük sınır → TEK işlemde dosya +
 * kayıt + kuyruk işi. LLM çağrısı istek içinde YAPILMAZ; `cv.parse` işi yapar. Doğrulamadan geçemeyen dosya
 * günlük hakkı harcamaz ve depoya hiç yazılmaz.
 */
export async function uploadCv(
  deps: CvDeps,
  actor: Actor,
  form: CvUploadForm,
): Promise<CvUploadOutput> {
  const { db, storage } = deps;
  const now = nowOf(deps);
  if (!deps.llm) throw codedValidation('CV_PROVIDER_NOT_CONFIGURED');
  if (!(await transferConsentGranted(db, actor.userId))) {
    throw codedValidation('CV_TRANSFER_CONSENT_REQUIRED');
  }

  const bytes = new Uint8Array(await form.file.arrayBuffer());
  const check = checkCvPdf(bytes);
  if (!check.ok) throw codedValidation(check.code);

  const busy = await db.cvUpload.findFirst({
    where: { userId: actor.userId, status: { in: [...IN_FLIGHT] } },
    select: { id: true },
  });
  if (busy) throw codedConflict('CV_ALREADY_PROCESSING');

  try {
    await consumeRateLimit(db, cvParseRule(deps.dailyLimit), actor.userId, now);
  } catch (error) {
    if (isCodedError(error) && error.code === 'RATE_LIMITED') {
      throw codedRateLimited('CV_DAILY_LIMIT_REACHED', { limit: deps.dailyLimit });
    }
    throw error;
  }

  const key = newCvKey(actor.userId);
  try {
    const output = await db.$transaction(
      async (tx) => {
        await lockUser(tx, actor.userId, nowOf(deps));
        // Rıza kilit altında yeniden okunur: geri çekilmiş rızayla dosya kabul edilmez.
        if (!(await transferConsentGranted(tx, actor.userId))) {
          throw codedValidation('CV_TRANSFER_CONSENT_REQUIRED');
        }
        // Onay bekleyen eski sonuç, yeni yükleme gelince atılır (en fazla bir onay bekleyen CV).
        const stale = await tx.cvUpload.findMany({
          where: { userId: actor.userId, status: 'PARSED' },
          select: { id: true, storageKey: true },
        });
        if (stale.length > 0) {
          // Önce durum (PARSED satır dosyasız olamaz: DB kısıtı), sonra dosya.
          await tx.cvUpload.updateMany({
            where: { id: { in: stale.map((row) => row.id) } },
            data: { status: 'DISCARDED', parsedJson: DbNull },
          });
          await removeUploadFiles(tx, storage, stale, deps.holds);
        }
        await storage.put(key, bytes, { contentType: 'application/pdf' });
        const upload = await tx.cvUpload.create({
          data: {
            userId: actor.userId,
            storageKey: key,
            byteSize: bytes.length,
            pageCount: check.pageCount,
          },
          select: { id: true },
        });
        try {
          await deps.enqueue(tx, upload.id);
        } catch {
          // Kuyruk erişilemez: kayıt ve dosya geri alınır, kullanıcı daha sonra tekrar dener.
          throw codedValidation('CV_PARSE_UNAVAILABLE');
        }
        return { cvUploadId: upload.id, status: 'QUEUED' as const };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    emitEvent(db, actor.userId, { type: 'CV_UPLOADED', props: {} }, subjectFromActor(actor));
    return output;
  } catch (error) {
    await storage.delete(key).catch(() => logCv('upload_cleanup_failed', 'STORAGE'));
    // Kullanıcı başına tek işlenen CV (kısmi benzersiz indeks) yarışı.
    if ((error as { code?: string }).code === 'P2002') throw codedConflict('CV_ALREADY_PROCESSING');
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------------------------

const statusView = (row: {
  id: string;
  status: CvStatusOutput['status'];
  errorCode: string | null;
  createdAt: Date;
}): CvStatusOutput => ({
  cvUploadId: row.id,
  status: row.status,
  errorCode: row.errorCode,
  createdAt: row.createdAt.toISOString(),
});

export async function getCvStatus(
  deps: Pick<CvDeps, 'db'>,
  actor: Actor,
  cvUploadId: string,
): Promise<CvStatusOutput> {
  const row = await deps.db.cvUpload.findFirst({
    where: { id: cvUploadId, userId: actor.userId },
    select: { id: true, status: true, errorCode: true, createdAt: true },
  });
  if (!row) throw codedNotFound('RESOURCE_NOT_FOUND');
  return statusView(row);
}

/** Kullanıcının son CV'si (atılanlar sayılmaz; sayfa yenilenince kaldığı yerden sürsün diye); hiç yoksa `null`. */
export async function getLatestCv(
  deps: Pick<CvDeps, 'db'>,
  actor: Actor,
): Promise<CvStatusOutput | null> {
  const row = await deps.db.cvUpload.findFirst({
    where: { userId: actor.userId, status: { not: 'DISCARDED' } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, status: true, errorCode: true, createdAt: true },
  });
  return row ? statusView(row) : null;
}

// ---------------------------------------------------------------------------------------------
// Fark (onay ekranı)
// ---------------------------------------------------------------------------------------------

function splitYearMonth(prefix: 'start' | 'end' | 'issued', value: string | null) {
  const [year, month] = value ? value.split('-').map(Number) : [null, null];
  return {
    [`${prefix}Year`]: year ?? null,
    [`${prefix}Month`]: month ?? null,
  } as Record<`${typeof prefix}Year` | `${typeof prefix}Month`, number | null>;
}

async function loadSnapshot(tx: Tx, userId: string): Promise<CvSnapshot> {
  const [education, positions, languages, certifications, profile] = await Promise.all([
    tx.education.findMany({ where: { userId } }),
    tx.position.findMany({ where: { userId } }),
    tx.language.findMany({ where: { userId } }),
    tx.certification.findMany({ where: { userId } }),
    tx.profile.findUnique({
      where: { userId },
      select: {
        id: true,
        headline: true,
        summary: true,
        city: true,
        manualFields: true,
        tags: {
          where: { tag: { kind: 'SKILL' } },
          select: { tagId: true, tag: { select: { label: true } } },
        },
      },
    }),
  ]);
  const protectedRow = (row: { manuallyEdited: boolean; source: 'CV' | 'MANUAL' }) =>
    row.manuallyEdited || row.source === 'MANUAL';
  return {
    profile: profile
      ? {
          id: profile.id,
          value: { headline: profile.headline, summary: profile.summary, city: profile.city },
          manualFields: PROFILE_FIELDS.filter((field) => profile.manualFields.includes(field)),
        }
      : null,
    education: education.map((row) => ({
      id: row.id,
      protected: protectedRow(row),
      value: {
        institution: row.institution,
        level: row.level,
        fieldOfStudy: row.fieldOfStudy,
        startDate: toYearMonth(row.startYear, row.startMonth),
        endDate: toYearMonth(row.endYear, row.endMonth),
        isCurrent: row.isCurrent,
      },
    })),
    positions: positions.map((row) => ({
      id: row.id,
      protected: protectedRow(row),
      value: {
        company: row.companyRaw,
        companyId: row.companyId,
        title: row.titleRaw,
        titleId: row.titleId,
        employmentType: row.employmentType,
        startDate: toYearMonth(row.startYear, row.startMonth),
        endDate: toYearMonth(row.endYear, row.endMonth),
        isCurrent: row.isCurrent,
        description: row.description,
      },
    })),
    languages: languages.map((row) => ({
      id: row.id,
      protected: protectedRow(row),
      value: { name: row.name, level: row.level },
    })),
    certifications: certifications.map((row) => ({
      id: row.id,
      protected: protectedRow(row),
      value: {
        name: row.name,
        issuer: row.issuer,
        issuedDate: toYearMonth(row.issuedYear, row.issuedMonth),
      },
    })),
    skills: (profile?.tags ?? []).map((row) => ({
      id: row.tagId,
      protected: false,
      value: { name: row.tag.label ?? '', skillId: null },
    })),
  };
}

function proposalFrom(parsed: ParsedCv, lookup: DictionaryLookup): CvProposal {
  return {
    profile: parsed.profile,
    education: parsed.education,
    positions: parsed.positions.map((position) => ({
      ...position,
      companyId: lookupMatch(lookup.company, 'COMPANY', position.company)?.id ?? null,
      titleId: lookupMatch(lookup.title, 'TITLE', position.title)?.id ?? null,
    })),
    languages: parsed.languages,
    certifications: parsed.certifications,
    skills: parsed.skills.map((name) => ({
      name,
      skillId: lookupMatch(lookup.skill, 'SKILL', name)?.id ?? null,
    })),
  };
}

function namesOf(parsed: ParsedCv, decisions: readonly CvDecision[] = []) {
  const companies = new Set(parsed.positions.map((position) => position.company));
  const titles = new Set(parsed.positions.map((position) => position.title));
  const skills = new Set(parsed.skills);
  for (const decision of decisions) {
    if (!decision.values) continue;
    if (decision.section === 'POSITION') {
      companies.add(decision.values.company);
      titles.add(decision.values.title);
    } else if (decision.section === 'SKILL') {
      skills.add(decision.values.name);
    }
  }
  return { companies, titles, skills };
}

/** Saklı çıktıyı yeniden doğrular (savunma derinliği): bozuk/elle değiştirilmiş satır öneri üretemez. */
function readParsed(value: Prisma.JsonValue | null): ParsedCv {
  const result = parsedCvSchema.safeParse(value);
  if (!result.success) throw codedConflict('CV_NOT_READY');
  return result.data;
}

async function findParsedUpload(tx: Tx, userId: string, cvUploadId: string) {
  const upload = await tx.cvUpload.findFirst({
    where: { id: cvUploadId, userId },
    select: { id: true, status: true, parsedJson: true, storageKey: true },
  });
  if (!upload) throw codedNotFound('RESOURCE_NOT_FOUND');
  if (upload.status !== 'PARSED') throw codedConflict('CV_NOT_READY');
  return upload;
}

/** Sözlük kimlikleri istemciye gitmez ve "değişti mi" karşılaştırmasına girmez. */
function withoutDictionaryIds(entry: PositionEntry): ParsedPosition {
  const { companyId, titleId, ...rest } = entry;
  void companyId;
  void titleId;
  return rest;
}

function reviewItem(item: DiffItem, lookup: DictionaryLookup): CvReviewItem {
  const base = { key: item.key, status: item.status, changedFields: item.changedFields };
  switch (item.section) {
    case 'PROFILE':
      return {
        ...base,
        section: 'PROFILE',
        proposed: item.proposed,
        current: item.current,
        standardized: {},
      };
    case 'POSITION': {
      const proposed = withoutDictionaryIds(item.proposed);
      const current = item.current ? withoutDictionaryIds(item.current) : null;
      return {
        ...base,
        section: 'POSITION',
        proposed,
        current,
        standardized: {
          company: lookupMatch(lookup.company, 'COMPANY', item.proposed.company)?.name ?? null,
          title: lookupMatch(lookup.title, 'TITLE', item.proposed.title)?.name ?? null,
        },
      };
    }
    case 'SKILL':
      return {
        ...base,
        section: 'SKILL',
        proposed: { name: item.proposed.name },
        current: item.current ? { name: item.current.name } : null,
        standardized: {
          skill: lookupMatch(lookup.skill, 'SKILL', item.proposed.name)?.name ?? null,
        },
      };
    case 'EDUCATION':
      return {
        ...base,
        section: 'EDUCATION',
        proposed: item.proposed,
        current: item.current,
        standardized: {},
      };
    case 'LANGUAGE':
      return {
        ...base,
        section: 'LANGUAGE',
        proposed: item.proposed,
        current: item.current,
        standardized: {},
      };
    case 'CERTIFICATION':
      return {
        ...base,
        section: 'CERTIFICATION',
        proposed: item.proposed,
        current: item.current,
        standardized: {},
      };
  }
}

/** Onay ekranı verisi: ayrıştırılmış CV'nin mevcut profille farkı (yeni · değişen · çakışan). Hiçbir şey yazmaz. */
export async function getCvReview(
  deps: Pick<CvDeps, 'db'>,
  actor: Actor,
  cvUploadId: string,
): Promise<CvReview> {
  return deps.db.$transaction(async (tx) => {
    const upload = await findParsedUpload(tx, actor.userId, cvUploadId);
    const parsed = readParsed(upload.parsedJson);
    const lookup = await buildDictionaryLookup(tx, namesOf(parsed));
    const diff = computeCvDiff(proposalFrom(parsed, lookup), await loadSnapshot(tx, actor.userId));
    return {
      cvUploadId,
      items: diff.items.map((item) => reviewItem(item, lookup)),
      unchangedCount: diff.unchangedCount,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Uygulama
// ---------------------------------------------------------------------------------------------

type EducationValue = Extract<CvDecision, { section: 'EDUCATION' }>['values'];
type PositionValue = Extract<CvDecision, { section: 'POSITION' }>['values'];

const jsonOf = (value: unknown) => JSON.stringify(value);

/** Kullanıcının düzelttiği değer öneriden farklı mı? (düzeltilen kalem "elle düzeltilmiş" sayılır) */
function isEdited(decision: CvDecision, item: DiffItem): boolean {
  if (!decision.values) return false;
  if (item.section === 'POSITION') {
    return jsonOf(decision.values) !== jsonOf(withoutDictionaryIds(item.proposed));
  }
  if (item.section === 'SKILL')
    return (
      decision.values !== undefined &&
      jsonOf(decision.values) !== jsonOf({ name: item.proposed.name })
    );
  return jsonOf(decision.values) !== jsonOf(item.proposed);
}

type Patch = Record<string, unknown>;

/** Güncellemede yalnız değişen alanlar yazılır; kullanıcı düzelttiyse (değer verdiyse) bütün alanlar. */
function pick(fields: readonly string[] | 'ALL', name: string): boolean {
  return fields === 'ALL' || fields.includes(name);
}

function educationPatch(
  value: NonNullable<EducationValue>,
  fields: readonly string[] | 'ALL',
): Patch {
  return {
    ...(pick(fields, 'institution') ? { institution: value.institution } : {}),
    ...(pick(fields, 'level') ? { level: value.level } : {}),
    ...(pick(fields, 'fieldOfStudy') ? { fieldOfStudy: value.fieldOfStudy } : {}),
    ...(pick(fields, 'startDate') ? splitYearMonth('start', value.startDate) : {}),
    ...(pick(fields, 'endDate') ? splitYearMonth('end', value.endDate) : {}),
    ...(pick(fields, 'isCurrent') ? { isCurrent: value.isCurrent } : {}),
  };
}

function positionPatch(
  value: NonNullable<PositionValue>,
  fields: readonly string[] | 'ALL',
  lookup: DictionaryLookup,
): Patch {
  const company = lookupMatch(lookup.company, 'COMPANY', value.company);
  const title = lookupMatch(lookup.title, 'TITLE', value.title);
  return {
    ...(fields === 'ALL'
      ? {
          companyRaw: value.company,
          companyId: company?.id ?? null,
          sectorId: company?.sectorId ?? null,
        }
      : {}),
    ...(pick(fields, 'title') ? { titleRaw: value.title, titleId: title?.id ?? null } : {}),
    ...(pick(fields, 'employmentType') ? { employmentType: value.employmentType } : {}),
    ...(pick(fields, 'startDate') ? splitYearMonth('start', value.startDate) : {}),
    ...(pick(fields, 'endDate') ? splitYearMonth('end', value.endDate) : {}),
    ...(pick(fields, 'isCurrent') ? { isCurrent: value.isCurrent } : {}),
    ...(pick(fields, 'description') ? { description: value.description } : {}),
  };
}

/**
 * Kullanıcının kalem kalem kararını uygular — TEK işlemde. Kararı olmayan kalem YAZILMAZ; `CONFLICT` kalem
 * yalnız `overwriteMine` açıkça verilirse yazılır; kararın anahtarı güncel farkta yoksa (profil/CV değişti)
 * hiçbir şey yazılmaz (`CV_REVIEW_STALE`). Uygulama sonrası ayrıştırma çıktısı temizlenir, eski dosyalar silinir
 * (açık incelemeye bağlı olan hariç) ve her yeni staj için deneyim daveti oluşur.
 */
export async function applyCv(
  deps: CvDeps,
  actor: Actor,
  input: { cvUploadId: string; decisions: readonly CvDecision[] },
): Promise<ApplyCvOutput> {
  const { db, storage } = deps;
  const now = nowOf(deps);
  const scoreBefore = await storedScore(db, actor.userId);
  const applied = await db.$transaction(
    async (tx) => {
      await lockUser(tx, actor.userId, nowOf(deps));
      const upload = await findParsedUpload(tx, actor.userId, input.cvUploadId);
      const parsed = readParsed(upload.parsedJson);
      const lookup = await buildDictionaryLookup(tx, namesOf(parsed, input.decisions));
      const diff = computeCvDiff(
        proposalFrom(parsed, lookup),
        await loadSnapshot(tx, actor.userId),
      );

      // Önce bütün kararlar doğrulanır; tek hata varsa hiçbir kalem yazılmaz.
      const chosen = input.decisions.map((decision) => {
        const item = diff.items.find((candidate) => candidate.key === decision.key);
        if (!item) throw codedConflict('CV_REVIEW_STALE');
        if (item.section !== decision.section) throw codedValidation('VALIDATION_INVALID');
        if (item.status === 'CONFLICT' && !decision.overwriteMine) {
          throw codedConflict('CV_CONFLICT_UNRESOLVED');
        }
        return { decision, item, edited: isEdited(decision, item) };
      });

      let created = 0;
      let updated = 0;
      const touchedPositionIds: string[] = [];
      try {
        for (const { decision, item, edited } of chosen) {
          const fields = decision.values ? 'ALL' : item.changedFields;
          const editedFlag = edited ? { manuallyEdited: true } : {};
          switch (item.section) {
            case 'PROFILE': {
              const value = (decision.section === 'PROFILE' && decision.values) || item.proposed;
              const profile = await ensureProfile(tx, actor.userId);
              const current = await tx.profile.findUniqueOrThrow({
                where: { id: profile.id },
                select: { manualFields: true },
              });
              // Yalnız CV'nin sağladığı (dolu) alanlar ve — kullanıcı düzeltmediyse — farklı olanlar yazılır.
              const written = PROFILE_FIELDS.filter(
                (field) =>
                  value[field] !== null &&
                  (decision.values ? true : item.changedFields.includes(field)),
              );
              const data = Object.fromEntries(written.map((field) => [field, value[field]]));
              const manual = new Set(current.manualFields);
              if (edited) for (const field of written) manual.add(field);
              await tx.profile.update({
                where: { id: profile.id },
                data: { ...data, manualFields: [...manual] },
              });
              updated += item.existingId === null ? 0 : 1;
              created += item.existingId === null ? 1 : 0;
              break;
            }
            case 'EDUCATION': {
              const value = (decision.section === 'EDUCATION' && decision.values) || item.proposed;
              if (item.existingId === null) {
                await tx.education.create({
                  data: {
                    userId: actor.userId,
                    institution: value.institution,
                    ...(educationPatch(value, 'ALL') as object),
                    source: 'CV',
                    manuallyEdited: edited,
                  },
                });
                created += 1;
              } else {
                await tx.education.update({
                  where: { id: item.existingId },
                  data: { ...(educationPatch(value, fields) as object), ...editedFlag },
                });
                updated += 1;
              }
              break;
            }
            case 'POSITION': {
              const value = (decision.section === 'POSITION' && decision.values) || item.proposed;
              const company = lookupMatch(lookup.company, 'COMPANY', value.company);
              const title = lookupMatch(lookup.title, 'TITLE', value.title);
              if (item.existingId === null) {
                const row = await tx.position.create({
                  data: {
                    userId: actor.userId,
                    ...(positionPatch(value, 'ALL', lookup) as object),
                    titleRaw: value.title,
                    titleId: title?.id ?? null,
                    companyRaw: value.company,
                    source: 'CV',
                    manuallyEdited: edited,
                  } as Prisma.PositionUncheckedCreateInput,
                  select: { id: true },
                });
                touchedPositionIds.push(row.id);
                created += 1;
              } else {
                await tx.position.update({
                  where: { id: item.existingId },
                  data: {
                    ...(positionPatch(value, fields, lookup) as object),
                    ...editedFlag,
                  } as Prisma.PositionUncheckedUpdateInput,
                });
                touchedPositionIds.push(item.existingId);
                updated += 1;
              }
              if (!company) await recordUnmatched(tx, 'COMPANY', value.company);
              if (!title) await recordUnmatched(tx, 'TITLE', value.title);
              break;
            }
            case 'LANGUAGE': {
              const value = (decision.section === 'LANGUAGE' && decision.values) || item.proposed;
              if (item.existingId === null) {
                await tx.language.create({
                  data: {
                    userId: actor.userId,
                    name: value.name,
                    normalizedName: normalizedOf(value.name),
                    level: value.level,
                    source: 'CV',
                    manuallyEdited: edited,
                  },
                });
                created += 1;
              } else {
                await tx.language.update({
                  where: { id: item.existingId },
                  data: {
                    ...(pick(fields, 'name')
                      ? { name: value.name, normalizedName: normalizedOf(value.name) }
                      : {}),
                    ...(pick(fields, 'level') ? { level: value.level } : {}),
                    ...editedFlag,
                  },
                });
                updated += 1;
              }
              break;
            }
            case 'CERTIFICATION': {
              const value =
                (decision.section === 'CERTIFICATION' && decision.values) || item.proposed;
              const patch = {
                ...(pick(fields, 'name') ? { name: value.name } : {}),
                ...(pick(fields, 'issuer') ? { issuer: value.issuer } : {}),
                ...(pick(fields, 'issuedDate') ? splitYearMonth('issued', value.issuedDate) : {}),
              };
              if (item.existingId === null) {
                await tx.certification.create({
                  data: {
                    userId: actor.userId,
                    name: value.name,
                    issuer: value.issuer,
                    ...splitYearMonth('issued', value.issuedDate),
                    source: 'CV',
                    manuallyEdited: edited,
                  },
                });
                created += 1;
              } else {
                await tx.certification.update({
                  where: { id: item.existingId },
                  data: { ...patch, ...editedFlag },
                });
                updated += 1;
              }
              break;
            }
            case 'SKILL': {
              const name =
                (decision.section === 'SKILL' && decision.values?.name) || item.proposed.name;
              const skill = lookupMatch(lookup.skill, 'SKILL', name);
              // Beceri `Tag(SKILL)` + profil bağıdır; sözlükte yoksa kişisel etiket açılır ve yönetici kuyruğuna düşer.
              const profile = await ensureProfile(tx, actor.userId);
              const attached = await attachSkill(tx, profile.id, {
                name,
                canonicalName: skill?.name ?? null,
              });
              if (attached.created) created += 1;
              if (!skill) await recordUnmatched(tx, 'SKILL', name);
              break;
            }
          }
        }
      } catch (error) {
        // Eşzamanlı ekleme (aynı dil/beceri): sonuç bayat, hiçbir şey yazılmadı (işlem geri alınır).
        if ((error as { code?: string }).code === 'P2002') throw codedConflict('CV_REVIEW_STALE');
        throw error;
      }

      // Her yeni/güncellenen staj için "bu stajı yazmak ister misin?" daveti (pozisyon başına en fazla bir).
      let invitations = 0;
      if (touchedPositionIds.length > 0) {
        const internships = await tx.position.findMany({
          where: { id: { in: touchedPositionIds }, employmentType: 'INTERNSHIP' },
          select: { id: true },
        });
        if (internships.length > 0) {
          const result = await tx.experienceInvitation.createMany({
            data: internships.map((row) => ({ userId: actor.userId, positionId: row.id })),
            skipDuplicates: true,
          });
          invitations = result.count;
        }
      }

      await tx.cvUpload.update({
        where: { id: upload.id },
        data: { status: 'APPLIED', appliedAt: now, parsedJson: DbNull },
      });
      // Son CV uygulama anı profilde durur ("CV" tamamlama adımı ve tazelik hatırlatması bunu okur).
      const applied = await ensureProfile(tx, actor.userId);
      await tx.profile.update({ where: { id: applied.id }, data: { cvUpdatedAt: now } });
      await syncCompletionScore(tx, actor.userId, now);

      // Saklama: son dosya (bu CV) kalır; eski dosyalar silinir (açık incelemeye bağlı olan hariç).
      // Silme işlemin SON adımıdır: hata fırlatırsa işlem geri alınır.
      const old = await tx.cvUpload.findMany({
        where: {
          userId: actor.userId,
          id: { not: upload.id },
          storageKey: { not: null },
          status: { in: ['APPLIED', 'DISCARDED', 'FAILED'] },
        },
        select: { id: true, storageKey: true },
      });
      await removeUploadFiles(tx, storage, old, deps.holds);
      return { created, updated, invitations };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  const subject = subjectFromActor(actor);
  emitEvent(
    db,
    actor.userId,
    {
      type: 'CV_APPLIED',
      props: { created: Math.min(applied.created, 1000), updated: Math.min(applied.updated, 1000) },
    },
    subject,
  );
  emitProfileThresholds(db, actor.userId, scoreBefore, await storedScore(db, actor.userId));
  return applied;
}

// `Language`/`UserSkill` benzersizliği normalleştirilmiş ada göredir.
const normalizedOf = (value: string) => normalizeName(value);

// ---------------------------------------------------------------------------------------------
// Atma
// ---------------------------------------------------------------------------------------------

/** Onay bekleyen sonucu at: ayrıştırma çıktısı temizlenir, dosya silinir (açık incelemeye bağlıysa kalır). */
export async function discardCv(
  deps: CvDeps,
  actor: Actor,
  cvUploadId: string,
): Promise<DiscardCvOutput> {
  await deps.db.$transaction(
    async (tx) => {
      await lockUser(tx, actor.userId, nowOf(deps));
      const upload = await findParsedUpload(tx, actor.userId, cvUploadId);
      await tx.cvUpload.update({
        where: { id: upload.id },
        data: { status: 'DISCARDED', parsedJson: DbNull },
      });
      await removeUploadFiles(tx, deps.storage, [upload], deps.holds);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  return { discarded: true };
}

// ---------------------------------------------------------------------------------------------
// Staj → deneyim daveti
// ---------------------------------------------------------------------------------------------

export async function listExperienceInvitations(
  deps: Pick<CvDeps, 'db'>,
  actor: Actor,
): Promise<ExperienceInvitationsOutput> {
  const rows = await deps.db.experienceInvitation.findMany({
    where: { userId: actor.userId, status: 'OPEN' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      positionId: true,
      position: {
        select: {
          companyRaw: true,
          titleRaw: true,
          startYear: true,
          startMonth: true,
          endYear: true,
          endMonth: true,
        },
      },
    },
  });
  return {
    invitations: rows.map((row) => ({
      id: row.id,
      positionId: row.positionId,
      company: row.position.companyRaw,
      title: row.position.titleRaw,
      startDate: toYearMonth(row.position.startYear, row.position.startMonth),
      endDate: toYearMonth(row.position.endYear, row.position.endMonth),
    })),
  };
}

export async function dismissExperienceInvitation(
  deps: Pick<CvDeps, 'db'>,
  actor: Actor,
  invitationId: string,
): Promise<{ dismissed: true }> {
  const result = await deps.db.experienceInvitation.updateMany({
    where: { id: invitationId, userId: actor.userId },
    data: { status: 'DISMISSED' },
  });
  if (result.count === 0) throw codedNotFound('RESOURCE_NOT_FOUND');
  return { dismissed: true };
}

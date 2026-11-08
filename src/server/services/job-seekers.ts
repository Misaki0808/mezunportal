import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  SEEKER_CONTACT_NOT_REQUESTABLE,
  getMyHiringDeclarationSchema,
  getMySeekerSettingsSchema,
  hiringDeclarationSchema,
  previewSeekerContactSchema,
  requestSeekerContactOutputSchema,
  requestSeekerContactSchema,
  searchSeekersSchema,
  seekerCardSchema,
  seekerContactPreviewSchema,
  seekerPageSchema,
  seekerSettingsSchema,
  setHiringDeclarationSchema,
  setSeekerSettingsSchema,
  type GetMyHiringDeclarationInput,
  type GetMySeekerSettingsInput,
  type HiringDeclaration,
  type PreviewSeekerContactInput,
  type RequestSeekerContactInput,
  type RequestSeekerContactOutput,
  type SearchSeekersInput,
  type SeekerCard,
  type SeekerContactPreview,
  type SeekerPage,
  type SeekerSettings,
  type SetHiringDeclarationInput,
  type SetSeekerSettingsInput,
} from '@/contracts/job-seekers';
import { resultBucketOf } from '@/contracts/metrics';
import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { codedForbidden, codedNotFound, codedRateLimited } from '@/lib/errors';

import type { Actor } from '../permissions/actor';
import { createPermissions } from '../permissions/guards';
import { findSeekerByRef, searchSeekerRows, type SeekerRow } from '../repositories/job-seekers';
import { cardTags, classOfCard, headlineForCard } from '../rules/seekerCard';
import { requestableFieldsOf, sendContactRequest } from './contactRequest';
import { emitEvent } from './event';
import { getConsentState, requireConsent } from './privacy';
import { RATE_LIMITS, consumeRateLimit, consumeRateLimitBy, peekRateLimit } from './rateLimit';
import { revokeSeekerVisibility } from './seeker-visibility';

/**
 * Ters yönlü arama ("staj arıyorum"; P2-06, docs/faz2-plan.md, D20/D28/D7/K-07). Sözleşme ve gizlilik ilkeleri
 * `src/contracts/job-seekers.ts` başında; burada şu ek ilkeler uygulanır:
 *  - Her eylem önce kimlik/rol/rıza kapısından geçer (`requireVerifiedMember` + merkezi rıza). Arama eylemleri ayrıca "işe alım
 *    yapıyorum" beyanını ister; beyan kapanınca arama ANINDA kapanır (beyan her çağrıda okunur).
 *  - Görünürlük sorgu anında depoda hesaplanır (son rıza satırı); servis ek bir önbellek tutmaz.
 *  - Kart `seekerCardSchema` ile doğrulanarak çıkar (strict): beklenmeyen alan şema hatasıyla düşer, sessizce sızmaz.
 */

export type JobSeekerDeps = { db: PrismaClient; now?: () => Date };
type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;
const nowOf = (deps: JobSeekerDeps) => (deps.now ?? (() => new Date()))();
const DOC = 'JOB_SEEKER_VISIBILITY' as const;

async function asRole<T>(
  deps: JobSeekerDeps,
  userId: string,
  role: 'STUDENT' | 'ALUMNI',
  run: (tx: Tx, actor: Actor, now: Date) => Promise<T>,
): Promise<T> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR SHARE`;
    const permissions = createPermissions({
      db: () => tx,
      getSessionUserId: async () => userId,
      now: () => now,
    });
    const actor = await permissions.requireVerifiedMember({ roles: [role] });
    await requireConsent(tx, userId);
    return run(tx, actor, now);
  }, TX_OPTIONS);
}

/** Doğrulanmış etkin mezun + "işe alım yapıyorum" beyanı. Beyan yoksa/kapatıldıysa `SEEKER_HIRING_DECLARATION_REQUIRED`. */
async function asHiringAlumni<T>(
  deps: JobSeekerDeps,
  userId: string,
  run: (tx: Tx, universityIds: string[], now: Date) => Promise<T>,
): Promise<T> {
  return asRole(deps, userId, 'ALUMNI', async (tx, actor, now) => {
    const profile = await tx.profile.findUnique({
      where: { userId },
      select: { hiringDeclaredAt: true },
    });
    if (!profile?.hiringDeclaredAt) throw codedForbidden('SEEKER_HIRING_DECLARATION_REQUIRED');
    return run(tx, await alumniUniversityIds(tx, actor), now);
  });
}

/** K-07: mezunun doğrulanmış etkin MEZUN üyeliklerinin üniversiteleri (öğrenci/akademisyen üyeliği kapsamı genişletmez). */
async function alumniUniversityIds(tx: Tx, actor: Actor): Promise<string[]> {
  const departmentIds = actor.facts.memberships
    .filter((m) => m.role === 'ALUMNI' && m.verificationStatus === 'VERIFIED' && m.endedAt === null)
    .map((m) => m.departmentId);
  if (departmentIds.length === 0) return [];
  const rows = await tx.department.findMany({
    where: { id: { in: departmentIds } },
    select: { faculty: { select: { universityId: true } } },
  });
  return [...new Set(rows.map((row) => row.faculty.universityId))];
}

// ---------------------------------------------------------------------------------------------
// Kart eşlemesi (BEYAZ LİSTE)
// ---------------------------------------------------------------------------------------------

/** Satırdan kart. Alanlar tek tek yazılır (yayılma yok) ve şemadan geçer; kimlik/ad/e-posta alanı bu fonksiyona girmez. */
function toCard(row: SeekerRow, now: Date): SeekerCard {
  return seekerCardSchema.parse({
    ref: row.ref,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    classStanding: classOfCard({ entryYear: row.entryYear, classOffset: row.classOffset }, now),
    headline: headlineForCard(row.headline, {
      name: row.guardName,
      email: row.guardEmail,
      userId: row.userId,
    }),
    tags: cardTags(row.tags).map((tag) => ({ kind: tag.kind, slug: tag.slug })),
    termYear: row.termYear,
    termSeason: row.termSeason,
  });
}
const withoutRef = ({ ref: _ref, ...card }: SeekerCard) => {
  void _ref;
  return card;
};

// ---------------------------------------------------------------------------------------------
// Öğrenci: ayarlar
// ---------------------------------------------------------------------------------------------

async function loadSettings(tx: Tx, userId: string, now: Date): Promise<SeekerSettings> {
  const [profile, user, state] = await Promise.all([
    tx.profile.findUnique({
      where: { userId },
      select: {
        id: true,
        headline: true,
        seekingInternship: true,
        seekingTermYear: true,
        seekingTermSeason: true,
        seekerRef: true,
        seekerViewCount: true,
      },
    }),
    tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
    getConsentState(tx, userId),
  ]);
  const doc = state.documents.find((d) => d.documentType === DOC);
  const granted =
    doc?.lastDecision?.granted === true && doc.lastDecision.version === doc.currentVersion;
  const membership = await tx.membership.findFirst({
    where: { userId, role: 'STUDENT', verificationStatus: 'VERIFIED', endedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      departmentId: true,
      entryYear: true,
      classOffset: true,
      department: { select: { name: true } },
    },
  });
  const tags = profile
    ? await tx.profileTag.findMany({
        where: { profileId: profile.id, tag: { curated: true } },
        select: { tag: { select: { kind: true, slug: true } } },
        orderBy: [{ tag: { kind: 'asc' } }, { tag: { slug: 'asc' } }],
      })
    : [];
  const preview =
    membership && profile
      ? withoutRef(
          toCard(
            {
              userId,
              ref: profile.seekerRef ?? 'onizleme-yok-onizleme',
              headline: profile.headline,
              departmentId: membership.departmentId,
              departmentName: membership.department.name,
              entryYear: membership.entryYear,
              classOffset: membership.classOffset,
              termYear: profile.seekingTermYear,
              termSeason: profile.seekingTermSeason,
              tags: tags.map((row) => row.tag),
              guardName: user.name,
              guardEmail: user.email,
            },
            now,
          ),
        )
      : null;
  return seekerSettingsSchema.parse({
    seekingInternship: profile?.seekingInternship ?? false,
    termYear: profile?.seekingTermYear ?? null,
    termSeason: profile?.seekingTermSeason ?? null,
    consent: {
      granted,
      currentVersion: CURRENT_CONSENT_VERSIONS[DOC],
      needsAction: doc?.needsAction ?? false,
    },
    visible: Boolean(profile?.seekingInternship && granted && membership),
    viewCount: profile?.seekerViewCount ?? 0,
    preview,
  });
}

export async function getMySeekerSettings(
  deps: JobSeekerDeps,
  userId: string,
  input: GetMySeekerSettingsInput = {},
): Promise<SeekerSettings> {
  getMySeekerSettingsSchema.parse(input);
  return asRole(deps, userId, 'STUDENT', (tx, _actor, now) => loadSettings(tx, userId, now));
}

/**
 * Ayarları KAYDEDER (tam değiştirme: gönderilmeyen dönem boşaltılır). Açmak için güncel sürümde verilmiş rıza şarttır
 * (`SEEKER_CONSENT_REQUIRED`). Açıkken kimlik (`seekerRef`) kararlıdır; yeniden açılışta yeni kimlik üretilir ve sayaç sıfırlanır.
 * Kapatmak her zaman serbesttir: kimlik silinir, bekleyen talepler kapanır.
 */
export async function setSeekerSettings(
  deps: JobSeekerDeps,
  userId: string,
  input: SetSeekerSettingsInput,
): Promise<SeekerSettings> {
  const parsed = setSeekerSettingsSchema.parse(input);
  return asRole(deps, userId, 'STUDENT', async (tx, _actor, now) => {
    const term = {
      seekingTermYear: parsed.termYear ?? null,
      seekingTermSeason: parsed.termSeason ?? null,
    };
    if (parsed.seekingInternship) {
      const state = await getConsentState(tx, userId);
      const doc = state.documents.find((d) => d.documentType === DOC);
      const granted =
        doc?.lastDecision?.granted === true && doc.lastDecision.version === doc.currentVersion;
      if (!granted) throw codedForbidden('SEEKER_CONSENT_REQUIRED');
      const existing = await tx.profile.findUnique({
        where: { userId },
        select: { seekerRef: true },
      });
      const fresh = existing?.seekerRef == null;
      const data = {
        seekingInternship: true,
        seekerRef: existing?.seekerRef ?? randomUUID(),
        ...(fresh ? { seekerViewCount: 0 } : {}),
        ...term,
      };
      await tx.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    } else {
      await tx.profile.upsert({
        where: { userId },
        create: { userId, ...term },
        update: { ...term },
      });
      await revokeSeekerVisibility(tx, userId, now);
    }
    return loadSettings(tx, userId, now);
  });
}

// ---------------------------------------------------------------------------------------------
// Mezun: beyan
// ---------------------------------------------------------------------------------------------

export async function getMyHiringDeclaration(
  deps: JobSeekerDeps,
  userId: string,
  input: GetMyHiringDeclarationInput = {},
): Promise<HiringDeclaration> {
  getMyHiringDeclarationSchema.parse(input);
  return asRole(deps, userId, 'ALUMNI', async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { userId },
      select: { hiringDeclaredAt: true },
    });
    return hiringDeclarationSchema.parse({
      hiring: profile?.hiringDeclaredAt != null,
      declaredAt: profile?.hiringDeclaredAt ?? null,
    });
  });
}

/** Beyanı açar/kapatır. Açıkken tekrar açmak ilk beyan anını korur; kapatınca arama ANINDA kapanır. */
export async function setHiringDeclaration(
  deps: JobSeekerDeps,
  userId: string,
  input: SetHiringDeclarationInput,
): Promise<HiringDeclaration> {
  const parsed = setHiringDeclarationSchema.parse(input);
  return asRole(deps, userId, 'ALUMNI', async (tx, _actor, now) => {
    const existing = await tx.profile.findUnique({
      where: { userId },
      select: { hiringDeclaredAt: true },
    });
    const declaredAt = parsed.hiring ? (existing?.hiringDeclaredAt ?? now) : null;
    await tx.profile.upsert({
      where: { userId },
      create: { userId, hiringDeclaredAt: declaredAt },
      update: { hiringDeclaredAt: declaredAt },
    });
    return hiringDeclarationSchema.parse({ hiring: declaredAt !== null, declaredAt });
  });
}

// ---------------------------------------------------------------------------------------------
// Mezun: arama
// ---------------------------------------------------------------------------------------------

/**
 * Aday arama. Günlük 50 kart hakkı DÖNEN KART SAYISI kadar azalır; hak bitince `RATE_LIMITED`, hak kısmen yetiyorsa sayfa kalan hakla
 * kısaltılır (sayfalamayla aşılamaz). Gösterilen her karta bir görüntülenme eklenir (kim baktığı tutulmaz). Olay yalnız sonuç kovasını yazar.
 */
export async function searchSeekers(
  deps: JobSeekerDeps,
  userId: string,
  input: SearchSeekersInput,
): Promise<SeekerPage> {
  const parsed = searchSeekersSchema.parse(input);
  const page = await asHiringAlumni(deps, userId, async (tx, universityIds, now) => {
    const { remaining } = await peekRateLimit(tx, RATE_LIMITS.seekerCards, userId, now);
    if (remaining <= 0) throw codedRateLimited('RATE_LIMITED');
    const { rows, total } = await searchSeekerRows(
      tx,
      {
        viewerId: userId,
        universityIds,
        consentVersion: CURRENT_CONSENT_VERSIONS[DOC],
        departmentId: parsed.departmentId,
        tagSlugs: parsed.tags,
        termYear: parsed.termYear,
        termSeason: parsed.termSeason,
      },
      { limit: Math.min(parsed.pageSize, remaining), offset: (parsed.page - 1) * parsed.pageSize },
    );
    if (rows.length > 0) {
      await consumeRateLimitBy(tx, RATE_LIMITS.seekerCards, userId, rows.length, now);
      await tx.profile.updateMany({
        where: { seekerRef: { in: rows.map((row) => row.ref) } },
        data: { seekerViewCount: { increment: 1 } },
      });
    }
    return seekerPageSchema.parse({
      items: rows.map((row) => toCard(row, now)),
      total,
      page: parsed.page,
      pageSize: parsed.pageSize,
      remainingCardsToday: remaining - rows.length,
    });
  });
  // Kullanım olayı (P1-13): yalnız sonuç kovası; süzgeç değerleri ve kartlar yazılmaz.
  emitEvent(deps.db, userId, {
    type: 'JOB_SEEKER_SEARCH',
    props: { results: resultBucketOf(page.total) },
  });
  return page;
}

// ---------------------------------------------------------------------------------------------
// Mezun: kart üzerinden iletişim (D7)
// ---------------------------------------------------------------------------------------------

const queryFor = (userId: string, universityIds: string[]) => ({
  viewerId: userId,
  universityIds,
  consentVersion: CURRENT_CONSENT_VERSIONS[DOC],
});

/**
 * Önizleme. Talep edilemeyen her durum (kart yok/kapalı/kapsam dışı/rıza geri alınmış, açık talep var, açık alan yok) TEK genel yanıta
 * düşer. Hız sınırı önce: kimlik taraması yavaşlar. Yanıtta adayın adı/kimliği yoktur.
 */
export async function previewSeekerContact(
  deps: JobSeekerDeps,
  userId: string,
  input: PreviewSeekerContactInput,
): Promise<SeekerContactPreview> {
  const parsed = previewSeekerContactSchema.parse(input);
  return asHiringAlumni(deps, userId, async (tx, universityIds, now) => {
    await consumeRateLimit(tx, RATE_LIMITS.contactPreview, userId, now);
    const row = await findSeekerByRef(tx, queryFor(userId, universityIds), parsed.ref);
    // Olumsuz durumlarda da aynı sorgu akışı (kaba süre farkı azaltılır; sabit süre garantisi değildir).
    const fields = await requestableFieldsOf(tx, row?.userId ?? userId);
    if (!row || fields.length === 0) return SEEKER_CONTACT_NOT_REQUESTABLE;
    return seekerContactPreviewSchema.parse({
      canRequest: true,
      card: withoutRef(toCard(row, now)),
      requestableFields: fields,
    });
  });
}

/**
 * Adaya iletişim talebi (mevcut `ContactRequest` akışı; `source = SEEKER_PROFILE`). Hedef sunucuda opak kimlikten çözülür; adayın adı/kimliği
 * çıktıda yoktur ve talep eden onaydan önce giden listede de görmez (D7). Aylık 20 talep sınırı.
 */
export async function requestSeekerContact(
  deps: JobSeekerDeps,
  userId: string,
  input: RequestSeekerContactInput,
): Promise<RequestSeekerContactOutput> {
  const parsed = requestSeekerContactSchema.parse(input);
  const found = await asHiringAlumni(deps, userId, async (tx, universityIds, now) => {
    await consumeRateLimit(tx, RATE_LIMITS.seekerContact, userId, now);
    const row = await findSeekerByRef(tx, queryFor(userId, universityIds), parsed.ref);
    return row ? { universityIds, targetUserId: row.userId, card: toCard(row, now) } : null;
  });
  if (!found) throw codedNotFound('RESOURCE_NOT_FOUND');
  const now = nowOf(deps);
  const sent = await sendContactRequest(
    deps.db,
    userId,
    { targetUserId: found.targetUserId, fields: parsed.fields, message: parsed.message ?? null },
    now,
    // D7: kaynak sunucuda yazılır; özet kimlik içermeyen kart alanlarıdır (başlık satırı kimlik denetiminden geçmiştir).
    {
      source: 'SEEKER_PROFILE',
      title: found.card.headline ?? found.card.departmentName,
      organization: found.card.departmentName,
    },
  );
  // Çözümleme ile yazma arasında rıza geri alınmış olabilir (ayrı işlemler): görünürlük yeniden doğrulanır; kalkmışsa talep kapatılır.
  const stillVisible = await findSeekerByRef(
    deps.db,
    { ...queryFor(userId, found.universityIds), keepOpenRequests: true },
    parsed.ref,
  );
  if (!stillVisible) {
    await deps.db.contactRequest.updateMany({
      where: { id: sent.requestId, status: 'PENDING' },
      data: { status: 'REJECTED', decidedAt: now },
    });
    throw codedNotFound('RESOURCE_NOT_FOUND');
  }
  return requestSeekerContactOutputSchema.parse({ requestId: sent.requestId, status: 'PENDING' });
}

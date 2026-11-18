import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '../src/generated/prisma/client';
import { awardFreezeAt } from '../src/server/rules/yearAlumni';
import { seedUserId } from './seed-accounts';
import { INSTITUTION_SEED } from './seed-data';
import { SAMPLE_ALUMNI, sampleAlumnusId } from './seed-phase2';
import { seedUuid } from './seed-util';

/**
 * Yılın Mezunu DENEME SENARYOSU (kart 470): deneme turunda seçim, yayın rızası ve doğrulama bağlantısı adımları görülebilsin diye
 * geçmiş yıllara ait iki DONMUŞ dönem yazar. Yalnız `APP_ENV` `local` ya da `test` iken çalışır; başka değerde ya da tanımsızken hiçbir şey yazmaz.
 *
 * - 2023 akademik yılı: dondurulmuş aday listesi, ödül YOK. Bölüm yöneticisi `/yonetim/yilin-mezunu` ekranında "Bu mezunu seç"i dener.
 * - 2024 akademik yılı: dondurulmuş aday listesi ve `alumniMentor` (Mert) için VERİLMİŞ ödül. Mezun `/odullerim` ekranında yayın rızasını
 *   kendisi verir; rıza ve doğrulama bağlantısı seed'de yoktur (rıza kişinin kendi kararıdır, seed uydurmaz).
 *
 * İş kuralları korunur: dönem, tören gününden 30 gün önce (iş mantığının izin verdiği 2 dakikalık payla) donmuş görünür; adaylar o anda
 * uygun olan doğrulanmış mezunlardır (açık şüphe kaydı olanlar hariç); ödül donmuş listedeki bir adaya verilir, döngü başına tek ödül;
 * ödül ve döngü ayarı işlem kaydına yazılır (kayıt yalnız eklenir, silme yok). Servis kodu (`server-only`) seed'den çağrılamadığı için
 * satırlar elle yazılır; tutarlılığı `seed-awards.db.test.ts` gerçek servis fonksiyonlarıyla sınar.
 *
 * İdempotent ve ekleyicidir: aynı bölüm ve yıl için döngü zaten varsa (örneğin yönetici o yıla tören tarihi kaydettiyse ya da seçim yaptıysa)
 * o döngüye hiç dokunulmaz; hiçbir kayıt silinmez ya da güncellenmez. Yıllar sabittir (arayüzün varsayılan yılı olan "geçen yıl"a denk gelmez,
 * böylece rehberdeki tören tarihi adımı bozulmaz). Aday listesi sabit bir sahte kümedir (Mert + dört örnek mezun); bu yıllarda puan, deneyim ya da
 * görüşme verisi olmadığından değerler 0'dır, yeniden hesaplama da aynısını verir.
 */
const NS = 'awards';
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const ALLOWED_ENVS: readonly string[] = ['local', 'test'];

const CYCLES = [
  { year: 2023, ceremonyDate: '2024-07-05', winner: false },
  { year: 2024, ceremonyDate: '2025-07-04', winner: true },
] as const;
const SELECT_REASON = 'Örnek veri: deneme turu için seçilmiş ödül.';

async function candidateIds(prisma: PrismaClient, departmentId: string, now: Date) {
  const wanted = [seedUserId('alumniMentor'), ...SAMPLE_ALUMNI.map(sampleAlumnusId)];
  const members = await prisma.membership.findMany({
    where: {
      departmentId,
      role: 'ALUMNI',
      endedAt: null,
      verificationStatus: 'VERIFIED',
      userId: { in: wanted },
      user: {
        deletedAt: null,
        OR: [{ banned: false }, { banExpires: { lte: now } }],
        suspicionFlags: { none: { status: 'OPEN' } },
      },
    },
    select: { userId: true },
  });
  return members.map((member) => member.userId).sort();
}

export async function seedAwardScenario(
  prisma: PrismaClient,
  appEnv: string | undefined = process.env.APP_ENV,
  now: Date = new Date(),
) {
  if (!appEnv || !ALLOWED_ENVS.includes(appEnv)) return;
  const department = await prisma.department.findFirstOrThrow({
    where: { code: INSTITUTION_SEED.department.code },
    select: { id: true },
  });
  const departmentId = department.id;
  const actorId = seedUserId('departmentAdmin');
  const winnerId = seedUserId('alumniMentor');
  const candidates = await candidateIds(prisma, departmentId, now);

  for (const { year, ceremonyDate, winner } of CYCLES) {
    const existing = await prisma.awardCycle.findUnique({
      where: { departmentId_year: { departmentId, year } },
      select: { id: true },
    });
    if (existing) continue;
    // Ödül verilecek döngüde kazanan aday değilse (hesap silinmiş, askıda…) ya da aday yoksa döngü hiç kurulmaz.
    if (!candidates.length || (winner && !candidates.includes(winnerId))) continue;

    const ceremonyAt = new Date(`${ceremonyDate}T00:00:00+03:00`);
    const frozenAt = new Date(awardFreezeAt(ceremonyDate).getTime() + MINUTE);
    const cycleId = seedUuid(NS, `cycle:${year}`);
    await prisma.$transaction(async (tx) => {
      await tx.awardCycle.create({
        data: { id: cycleId, departmentId, year, ceremonyAt, frozenAt },
      });
      await tx.awardCandidate.createMany({
        data: candidates.map((userId) => ({
          id: seedUuid(NS, `candidate:${year}:${userId}`),
          cycleId,
          userId,
          points: 0,
          experienceCount: 0,
          meetingCount: 0,
          breakdown: [],
        })),
      });
      await tx.adminAuditLog.createMany({
        data: [
          {
            id: seedUuid(NS, `audit:configure:${year}`),
            actorId,
            action: 'AWARD_CYCLE_CONFIGURE',
            targetType: 'AWARD_CYCLE',
            targetId: cycleId,
            createdAt: new Date(frozenAt.getTime() - 20 * DAY),
          },
        ],
        skipDuplicates: true,
      });
      if (!winner) return;
      const awardId = seedUuid(NS, `award:${year}`);
      const awardedAt = new Date(frozenAt.getTime() + 10 * DAY);
      await tx.award.create({
        data: {
          id: awardId,
          cycleId,
          departmentId,
          year,
          userId: winnerId,
          verificationCode: randomBytes(32).toString('base64url'),
          createdAt: awardedAt,
        },
      });
      await tx.adminAuditLog.createMany({
        data: [
          {
            id: seedUuid(NS, `audit:select:${year}`),
            actorId,
            action: 'AWARD_SELECT',
            targetType: 'AWARD',
            targetId: awardId,
            reason: SELECT_REASON,
            createdAt: awardedAt,
          },
        ],
        skipDuplicates: true,
      });
    });
  }
}

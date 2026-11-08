import type { PrismaClient } from '@/generated/prisma/client';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Aday görünürlüğünün kapatılması (P2-06; D20). Rıza geri alınınca (`recordConsents`) ve öğrenci "staj arıyorum"u kapatınca AYNI kurallar
 * çalışır: bayrak kapanır, opak kimlik (`seekerRef`) silinir, bekleyen aday-kaynaklı talepler `REJECTED` kapanır (talep edene neden söylenmez;
 * mevcut ret akışıyla aynı sonuç). Onaylı (`APPROVED`) talebe dokunulmaz: onay öğrencinin ayrı, açık kararıdır ve ayrıca geri alınabilir.
 * Görünürlük kararı zaten SORGU ANINDA son rıza satırına bakar; bu işlev temizliktir, güvenlik kapısı değildir.
 *
 * Bu dosya `privacy.ts` ile `job-seekers.ts` arasında döngüsel içe aktarma olmasın diye ayrıdır (yalnız tür bağımlılığı).
 */
type Db =
  | Pick<PrismaClient, 'profile' | 'contactRequest'>
  | Pick<Prisma.TransactionClient, 'profile' | 'contactRequest'>;

export async function revokeSeekerVisibility(
  db: Db,
  userId: string,
  now: Date,
): Promise<{ closedRequests: number }> {
  await db.profile.updateMany({
    where: { userId, OR: [{ seekingInternship: true }, { seekerRef: { not: null } }] },
    data: { seekingInternship: false, seekerRef: null },
  });
  const { count } = await db.contactRequest.updateMany({
    where: { targetId: userId, source: 'SEEKER_PROFILE', status: 'PENDING' },
    data: { status: 'REJECTED', decidedAt: now },
  });
  return { closedRequests: count };
}

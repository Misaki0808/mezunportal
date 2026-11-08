import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

import { normalizeName } from '../rules/dictionary';

type Tx = Prisma.TransactionClient;

/**
 * Beceri = `Tag` (tür SKILL) + `ProfileTag` (P1-06; TD-010). Etiket anahtarı (`slug`) normalleştirilmiş addır
 * (büyük/küçük harf, Türkçe harf, aksan farkı aynı beceriyi verir). Sözlükle eşleşen beceri KURALLI (`curated`)
 * etiket olur ve başkalarına öneri olarak listelenir; serbest metin beceri kişisel etiket olarak açılır
 * (`curated = false`), öneri listesine GİRMEZ (başka kullanıcının metni sızmasın).
 */
export const SKILL_SLUG_MAX = 200;

/** Profil satırı yoksa açar (ilk giriş akışıyla aynı varsayılanlar). */
export async function ensureProfile(tx: Tx, userId: string): Promise<{ id: string }> {
  return tx.profile.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });
}

export type SkillInput = {
  /** Kullanıcının yazdığı (temizlenmiş) ad. */
  name: string;
  /** Sözlükte eşleşen kurallı ad; varsa etiket onunla açılır. */
  canonicalName?: string | null;
};

/** Beceriyi profile bağlar; etiket yoksa açar. Aynı beceri ikinci kez eklenmez (`created = false`). */
export async function attachSkill(
  tx: Tx,
  profileId: string,
  input: SkillInput,
): Promise<{ tagId: string; created: boolean; slug: string }> {
  const curated = Boolean(input.canonicalName);
  const label = (input.canonicalName ?? input.name).slice(0, 80);
  const slug = normalizeName(label).slice(0, SKILL_SLUG_MAX);
  const tag = await tx.tag.upsert({
    where: { kind_slug: { kind: 'SKILL', slug } },
    create: { kind: 'SKILL', slug, label, curated },
    // Kurallı eşleşme gelirse kişisel etiket kurallıya yükselir ve kurallı ad kalır.
    update: curated ? { curated: true, label } : {},
    select: { id: true },
  });
  const link = await tx.profileTag.createMany({
    data: [{ profileId, tagId: tag.id }],
    skipDuplicates: true,
  });
  return { tagId: tag.id, created: link.count > 0, slug };
}

/** Hiçbir profile bağlı olmayan KİŞİSEL beceri etiketlerini siler (serbest metin geride kalmasın). */
export async function pruneOrphanSkillTags(tx: Tx): Promise<number> {
  const result = await tx.tag.deleteMany({
    where: { kind: 'SKILL', curated: false, profiles: { none: {} } },
  });
  return result.count;
}

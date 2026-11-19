import { Prisma, type PrismaClient } from '@/generated/prisma/client';

/** Türkçe ad sıralaması için ICU harmanlaması (ç, ğ, ı, ö, ş, ü ve i/ı doğru yere oturur); Postgres'te ICU gerekir. */
export const TURKISH_COLLATION = 'tr-TR-x-icu';

type Queryable = Pick<PrismaClient, '$queryRaw'>;

let available: Promise<boolean> | undefined;

/**
 * Harmanlama bu Postgres kurulumunda tanımlı mı? Süreç başına bir kez sorulur. Yoksa (ICU'suz kurulum) sorgu hata
 * vermez, veritabanının varsayılan sırasına düşer; canlı Postgres'te ICU gerekir (`docs/engineering.md`).
 */
export function turkishCollationAvailable(db: Queryable): Promise<boolean> {
  available ??= db.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_collation WHERE collname = ${TURKISH_COLLATION}) AS ok`
    .then((rows) => rows[0]?.ok === true)
    .catch(() => {
      available = undefined;
      return false;
    });
  return available;
}

/** `ORDER BY "name" ${await turkishCollate(db)}`: ICU varsa `COLLATE "tr-TR-x-icu"`, yoksa boş parça. */
export async function turkishCollate(db: Queryable): Promise<Prisma.Sql> {
  return (await turkishCollationAvailable(db)) ? Prisma.sql`COLLATE "tr-TR-x-icu"` : Prisma.empty;
}

/** Yalnız testler: önbelleği sıfırlar. */
export function resetTurkishCollationCache(): void {
  available = undefined;
}

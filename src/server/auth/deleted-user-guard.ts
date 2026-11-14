import 'server-only';

import { Prisma, type PrismaClient } from '@/generated/prisma/client';

/** Silinmiş (anonimleştirilmiş) kullanıcıya Better Auth ile yazma girişimi. Giriş bağlantısı/jeton akışı bunu hata olarak görür. */
export class DeletedUserError extends Error {
  constructor() {
    super('Silinmiş kullanıcıya yazılamaz');
    this.name = 'DeletedUserError';
  }
}

type UserIdData = { userId?: unknown; user?: { connect?: { id?: unknown } } };
function userIdOf(data: unknown): string | null {
  const value = data as UserIdData | null;
  if (typeof value?.userId === 'string') return value.userId;
  const connected = value?.user?.connect?.id;
  return typeof connected === 'string' ? connected : null;
}

/**
 * Kullanıcı silinmiş mi? Satıra `FOR SHARE` ile bakar: silme kilidi tutuyorsa bitene kadar bekler, bitince silinmişi görür.
 * Silme sürerken tetiklenen e-posta gönderimi (kendi veritabanı yazımı olmayan yol) bununla durdurulur.
 */
export async function isUserDeleted(db: PrismaClient, userId: string): Promise<boolean> {
  const rows = await db.$queryRaw<
    { deletedAt: Date | null }[]
  >`SELECT "deletedAt" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
  return !rows[0] || rows[0].deletedAt !== null;
}

/**
 * Better Auth'un kendi yazımlarını (oturum, hesap bağlama, kullanıcı güncelleme) hesap silmeyle yarıştırmaz (kart 371).
 *
 * Sorun: hesap silme kullanıcı satırını `FOR UPDATE` ile kilitler ve e-postayı anonimleştirir; Better Auth ise kendi
 * veritabanı işleminde değildir. Önceden alınmış bir bağlantı/jeton silme sürerken çalışırsa (ölçüldü):
 *  - yeni adres doğrulaması `User.email`'i gerçek adrese geri yazar (anonimleştirme bozulur, KVKK),
 *  - giriş bağlantısı silinmiş kullanıcıya oturum bırakır, hesap bağlama silinen kişinin sağlayıcı kimliğini geri yazar.
 *
 * Çözüm (adaptör düzeyi; Better Auth bu istemciyle çalışır):
 *  - oturum ve hesap OLUŞTURMA aynı işlemde kullanıcı satırına `FOR SHARE` kilidi alır ve `deletedAt`'i okur: silme kilidi
 *    tutarken bekler, bitince silinmişi görür ve yazmaz; silme, kilidi bırakmış bir yazmanın bitmesini bekler (bu yüzden
 *    yazma silmenin oturum/hesap temizliğinden SONRA tamamlanıp kalamaz);
 *  - kullanıcı GÜNCELLEME `deletedAt IS NULL` koşuluyla çalışır: silinmiş satıra e-posta, doğrulama ya da ad yazılamaz
 *    (`update` kayıt bulamayınca hata verir, `updateMany` 0 satır etkiler).
 */
export function guardDeletedUsers(db: PrismaClient): PrismaClient {
  async function createIfAlive<T>(
    userId: string | null,
    write: (tx: Prisma.TransactionClient) => Promise<T>,
    passThrough: () => Promise<T>,
  ): Promise<T> {
    if (userId === null) return passThrough();
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { deletedAt: Date | null }[]
      >`SELECT "deletedAt" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
      if (!rows[0] || rows[0].deletedAt) throw new DeletedUserError();
      return write(tx);
    });
  }

  return db.$extends({
    query: {
      session: {
        create: ({ args, query }) =>
          createIfAlive(
            userIdOf(args.data),
            (tx) => tx.session.create(args),
            () => query(args),
          ),
      },
      account: {
        create: ({ args, query }) =>
          createIfAlive(
            userIdOf(args.data),
            (tx) => tx.account.create(args),
            () => query(args),
          ),
      },
      user: {
        update: ({ args, query }) => query({ ...args, where: { ...args.where, deletedAt: null } }),
        updateMany: ({ args, query }) =>
          query({ ...args, where: { ...args.where, deletedAt: null } }),
      },
    },
  }) as unknown as PrismaClient;
}

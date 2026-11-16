import type { PrismaClient } from '@/generated/prisma/client';

/** Prisma model ve ham sorgu işlemlerini sayar; veritabanı yanıt sürelerinden etkilenmez. */
export function queryCounter(db: PrismaClient) {
  let count = 0;
  const client = db.$extends({
    query: {
      async $allOperations({ args, query }) {
        count += 1;
        return query(args);
      },
    },
  });
  return {
    client: client as unknown as PrismaClient,
    reset: () => {
      count = 0;
    },
    count: () => count,
  };
}

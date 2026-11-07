// `pnpm db:seed` — deterministik sahte veri. Her çalıştırmada aynı sonucu verir (idempotent).
// Next.js dışında çalıştığı için kendi istemcisini kurar (src/server/db.ts `server-only`dir).
// Modeller geldikçe ilgili adım kendi seeder'ını burada çağırır (rol başına test kullanıcıları: P0-04).
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import { runSeedModules } from './seed-framework';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL tanımlı değil (worktree için .env.local gerekir)');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }),
  });
  try {
    await runSeedModules(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Bağlantı adresi ve sürücü ayrıntısı yazılmaz.
  process.stderr.write(
    `seed başarısız: ${error instanceof Error ? error.name : 'bilinmeyen hata'}\n`,
  );
  process.exitCode = 1;
});

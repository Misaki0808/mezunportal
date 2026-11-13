/** TD-027 yeniden üretimi: `NODE_OPTIONS="--conditions=react-server --trace-deprecation" pnpm exec tsx scripts/td027-probe.ts` (yalnız yerel DB okuması). */
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { loadActor } from '../src/server/permissions/actor';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL gerekli');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
let warnings = 0;
const onWarning = (warning: Error) => {
  if (
    warning.message.includes('Calling client.query() when the client is already executing a query')
  )
    warnings++;
};
process.on('warning', onWarning);
try {
  const user = await db.user.findFirstOrThrow({
    where: { memberships: { some: { endedAt: null } } },
    select: { id: true },
  });
  const actor = await db.$transaction((tx) => loadActor(tx, user.id, new Date()));
  if (!actor) throw new Error('Üye bulunamadı');
  await new Promise<void>((resolve) => setImmediate(resolve));
  process.stdout.write(`TD-027: ${warnings} pg uyarısı\n`);
  if (warnings > 0) process.exitCode = 1;
} finally {
  process.off('warning', onWarning);
  await db.$disconnect();
}

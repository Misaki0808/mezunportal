/** TD-027 yeniden üretimi: `NODE_OPTIONS="--conditions=react-server --trace-deprecation" pnpm exec tsx scripts/td027-probe.ts` (yalnız yerel DB okuması). */
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { loadActor } from '../src/server/permissions/actor';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
function localDatabaseUrl(value: string | undefined): string {
  const message = 'TD-027 yalnız yerel PostgreSQL adresiyle çalışır';
  if (!value) throw new Error(message);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(message);
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.searchParams.has('host') ||
    url.searchParams.has('hostaddr')
  )
    throw new Error(message);
  return value;
}

const databaseUrl = localDatabaseUrl(process.env.DATABASE_URL);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
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

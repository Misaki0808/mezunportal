import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '@/generated/prisma/client';

import { unexpectedLogLine } from './unexpected-log';

/**
 * Gerçek sürücü şekli (kart 330): günlük satırı, Prisma 7 + pg sürücüsünün yük altında GERÇEKTEN fırlattığı hatalardan üretilir.
 * Sahte hata yalnız birim testlerdedir; kütüphane sürümü değişip şekil kayarsa bu dosya düşer.
 */
const clients: PrismaClient[] = [];
function client(options: Record<string, unknown> = {}): PrismaClient {
  const connectionString = process.env.DATABASE_URL_TEST;
  if (!connectionString) throw new Error('DATABASE_URL_TEST tanımlı değil');
  const instance = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 5000, ...options }),
  });
  clients.push(instance);
  return instance;
}
afterAll(async () => {
  await Promise.all(clients.map((instance) => instance.$disconnect().catch(() => undefined)));
});

async function caught(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('hata bekleniyordu');
}
const line = (error: unknown) =>
  JSON.parse(unexpectedLogLine('job', 'dbTest', error) ?? 'null') as Record<string, unknown>;

describe('gerçek sürücü hataları: errorCode genel, driverCode asıl pg kodu', () => {
  it('statement_timeout: P2010 + 57014', async () => {
    const db = client({ statement_timeout: 100 });
    const error = await caught(() => db.$queryRaw`SELECT pg_sleep(1)`);
    expect(line(error)).toEqual({
      event: 'job.unexpected',
      source: 'dbTest',
      errorName: 'PrismaClientKnownRequestError',
      errorCode: 'P2010',
      driverCode: '57014',
    });
  });

  it('yönetici bağlantıyı sonlandırdı: P2010 + 57P01', async () => {
    const db = client({ max: 1 });
    const error = await caught(() => db.$queryRaw`SELECT pg_terminate_backend(pg_backend_pid())`);
    expect(line(error)).toMatchObject({
      errorName: 'PrismaClientKnownRequestError',
      errorCode: 'P2010',
      driverCode: '57P01',
    });
  });

  it('bağlantı reddi (işlem başlatma): P1001, sürücü kodu yok; ana makine ve kapı satırda yok', async () => {
    const connectionString = process.env.DATABASE_URL_TEST!.replace(/:\d+\//, ':1/');
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 2000 }),
    });
    clients.push(db);
    const error = await caught(() => db.$transaction(async (tx) => tx.$queryRaw`SELECT 1`));
    const logged = unexpectedLogLine('job', 'dbTest', error)!;
    expect(JSON.parse(logged)).toMatchObject({ errorCode: 'P1001' });
    expect(JSON.parse(logged)).not.toHaveProperty('driverCode');
    expect(logged).not.toMatch(/127\.0\.0\.1|localhost|:1\b/);
  });
});

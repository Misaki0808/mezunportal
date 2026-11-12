import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { expect, test } from './fixture';
import { loginAs } from './login';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
test.describe.configure({ mode: 'parallel' });
for (const label of ['a', 'b']) {
  test(`eşzamanlı ${label}: aynı seed rolünün verisi diğer işçiden ayrıdır`, async ({
    page,
  }, info) => {
    test.skip(info.config.workers < 2, 'Bu yarış testi iki işçi gerektirir.');
    const index = info.parallelIndex;
    const user = await db.user.findUniqueOrThrow({
      where: { email: 'student@test.mezunportal.local' },
    });
    const name = `İzolasyon İşçisi ${index}`;
    const dir = path.join('.data', `e2e-barrier-${process.env.E2E_ISOLATION_RUN}`);
    try {
      await db.user.update({ where: { id: user.id }, data: { name } });
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, String(index)), 'hazır');
      await expect
        .poll(
          async () => {
            try {
              return await readFile(path.join(dir, String(1 - index)), 'utf8');
            } catch {
              return '';
            }
          },
          { timeout: 20_000 },
        )
        .toBe('hazır');
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(name);
      await loginAs(page, 'student');
      await expect(page.getByRole('heading', { name: 'Hesabın' })).toBeVisible();
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(name);
    } finally {
      await db.user.update({ where: { id: user.id }, data: { name: user.name } });
    }
  });
}

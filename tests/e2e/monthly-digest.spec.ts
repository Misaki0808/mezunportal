import { loginAs } from './login';
import { createHmac, randomUUID } from 'node:crypto';
import { expect, test } from './fixture';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { grantRequiredConsents } from '../../src/test/fixtures';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('aylık özetten girişsiz çıkış ve tekrar kullanım mobilde çalışır', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const subject = Buffer.from(user.id).toString('base64url');
  const mac = createHmac('sha256', process.env.BETTER_AUTH_SECRET!)
    .update(`monthly-digest:unsubscribe:v1:${subject}`)
    .digest('base64url');
  const token = `${subject}.${mac}`;
  try {
    await db.notificationPreference.upsert({
      where: { userId_type: { userId: user.id, type: 'MONTHLY_DIGEST' } },
      create: { userId: user.id, type: 'MONTHLY_DIGEST', enabled: true },
      update: { enabled: true },
    });
    for (let i = 0; i < 2; i++) {
      await page.goto(`/aylik-ozet/abonelikten-cik#token=${token}`);
      await expect(
        page.getByRole('status').filter({ hasText: 'aboneliğin kapatıldı' }),
      ).toBeVisible();
      await expect
        .poll(
          async () =>
            (
              await db.notificationPreference.findUniqueOrThrow({
                where: { userId_type: { userId: user.id, type: 'MONTHLY_DIGEST' } },
              })
            ).enabled,
        )
        .toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  } finally {
    await db.notificationPreference.deleteMany({
      where: { userId: user.id, type: 'MONTHLY_DIGEST' },
    });
  }
});

test('360 px: uzun ilan başlığı aylık özette yatay taşma oluşturmaz', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const student = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.student.email },
  });
  const author = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.alumniMentor.email },
  });
  const member = await db.membership.findFirstOrThrow({
    where: { userId: author.id, role: 'ALUMNI', endedAt: null },
  });
  await grantRequiredConsents(db, student.id);
  const tag = await db.tag.create({
    data: { kind: 'SKILL', slug: 'digest-' + randomUUID(), label: 'Özet denemesi', curated: false },
  });
  const profile = await db.profile.upsert({
    where: { userId: student.id },
    create: { userId: student.id },
    update: {},
  });
  await db.profileTag.create({ data: { profileId: profile.id, tagId: tag.id } });
  const title = 'UzunİlanBaşlığı'.repeat(7),
    now = new Date();
  let postingId: string | undefined;
  try {
    const posting = await db.jobPosting.create({
      data: {
        authorId: author.id,
        departmentIdAtWrite: member.departmentId,
        status: 'PUBLISHED',
        title,
        organizationName: 'Özet deneme kurumu',
        description: 'Yazılım geliştirme deneyimi kazanabileceğin çalışma ortamı.',
        isRemote: true,
        applyMethod: 'URL',
        applyUrl: 'https://example.invalid/basvur',
        deadlineOn: new Date(+now + 7 * 86400000),
        submittedAt: now,
        publishedAt: now,
        moderatedAt: now,
        moderatedById: author.id,
        targets: { create: { departmentId: member.departmentId } },
        tags: { create: { tagId: tag.id } },
      },
    });
    postingId = posting.id;
    await db.jobMatch.create({ data: { userId: student.id, postingId, createdAt: now } });
    await loginAs(page, 'student');
    await page.goto('/hesap/aylik-ozet');
    await expect(page.locator(`a[href="/ilanlar/${postingId}"]`)).toContainText(title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  } finally {
    if (postingId) {
      await db.jobMatch.deleteMany({ where: { postingId } });
      await db.jobPosting.delete({ where: { id: postingId } });
    }
    await db.profileTag.deleteMany({ where: { tagId: tag.id } });
    await db.tag.delete({ where: { id: tag.id } });
  }
});

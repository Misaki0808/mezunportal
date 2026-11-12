import { loginAs } from './login';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, test } from '@playwright/test';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('mobilde hedef seç, güvenli beceri açığını ve filtreli mentoru gör', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const [student, admin] = await Promise.all(
    [TEST_PERSONAS.student, TEST_PERSONAS.systemAdmin].map((persona) =>
      db.user.findUniqueOrThrow({ where: { email: persona.email }, select: { id: true } }),
    ),
  );
  const membership = await db.membership.findFirstOrThrow({
    where: { userId: student!.id, role: 'STUDENT', verificationStatus: 'VERIFIED', endedAt: null },
  });
  const previousProfile = await db.profile.findUnique({
    where: { userId: student!.id },
    select: { targetTitleId: true },
  });
  const key = randomUUID().slice(0, 8);
  const title = await db.title.create({
    data: { name: `Test Analisti ${key}`, normalizedName: `test analisti ${key}`, aliases: [] },
    select: { id: true, name: true },
  });
  const sql = await db.skill.create({
    data: { name: `Test SQL ${key}`, normalizedName: `test sql ${key}`, aliases: [] },
    select: { id: true, name: true },
  });
  const excel = await db.skill.create({
    data: { name: `Test Excel ${key}`, normalizedName: `test excel ${key}`, aliases: [] },
    select: { id: true, name: true },
  });
  const tags = await Promise.all(
    [sql, excel].map((skill) =>
      db.tag.create({
        data: { kind: 'SKILL', slug: skill.name.toLowerCase(), label: skill.name, curated: true },
        select: { id: true },
      }),
    ),
  );
  const users: string[] = [];
  try {
    for (let i = 0; i < 10; i++) {
      const user = await db.user.create({
        data: {
          name: `Örnek Mezun ${key} ${i}`,
          email: `test-${key}-${i}@example.test`,
          emailVerified: true,
        },
        select: { id: true },
      });
      users.push(user.id);
      await db.membership.create({
        data: {
          userId: user.id,
          departmentId: membership.departmentId,
          role: 'ALUMNI',
          verificationStatus: 'VERIFIED',
          verificationMethod: 'GRADUATION_DOCUMENT',
          verifiedAt: new Date(),
          verifiedById: admin!.id,
          graduationYear: 2020,
        },
      });
      await db.position.create({
        data: {
          userId: user.id,
          companyRaw: 'Örnek kurum',
          titleId: title.id,
          titleRaw: title.name,
          isCurrent: true,
          source: 'MANUAL',
        },
      });
      const profile = await db.profile.create({ data: { userId: user.id }, select: { id: true } });
      await db.profileTag.create({
        data: { profileId: profile.id, tagId: tags[i < 5 ? 0 : 1]!.id },
      });
      if (i === 0)
        await db.mentorProfile.create({
          data: {
            userId: user.id,
            isActive: true,
            monthlyCapacity: 4,
            sessionMinutes: 30,
            meetingModes: ['ONLINE'],
          },
        });
    }
    await loginAs(page, 'student');
    await page.goto('/profil');
    const panel = page.getByRole('region', { name: 'Hedefime ne kadar yakınım?' });
    await panel.getByLabel('Hedef pozisyonun').selectOption(title.id);
    await panel.getByRole('button', { name: 'Hedefi kaydet' }).click();
    await expect(panel.getByText('10+ mezun grubundan')).toBeVisible();
    await expect(panel.getByText(sql.name, { exact: true })).toBeVisible();
    await expect(panel.getByText(excel.name, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel
      .locator('li')
      .filter({ hasText: sql.name })
      .getByRole('link', { name: 'Bu beceri için mentor bul' })
      .click();
    await expect(page).toHaveURL(/\/mentorlar\?skill=/);
    await expect(page.getByText(`Örnek Mezun ${key} 0`)).toBeVisible();
    await page.goto('/profil');
    await page.getByRole('button', { name: 'Beceriler', exact: true }).click();
    const addSkill = page.getByLabel('Beceri ekle');
    await addSkill.fill(sql.name);
    await addSkill
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: 'Ekle', exact: true })
      .click();
    await expect(panel.getByText('Görünen becerilerde uyum: %50')).toBeVisible();
    await expect(panel.getByText(sql.name, { exact: true })).toHaveCount(0);
  } finally {
    if (previousProfile)
      await db.profile.update({
        where: { userId: student!.id },
        data: { targetTitleId: previousProfile.targetTitleId },
      });
    else await db.profile.deleteMany({ where: { userId: student!.id } });
    await db.profileTag.deleteMany({
      where: { profile: { userId: student!.id }, tagId: { in: tags.map((tag) => tag.id) } },
    });
    await db.mentorProfile.deleteMany({ where: { userId: { in: users } } });
    await db.position.deleteMany({ where: { userId: { in: users } } });
    await db.profile.deleteMany({ where: { userId: { in: users } } });
    await db.membership.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.tag.deleteMany({ where: { id: { in: tags.map((tag) => tag.id) } } });
    await db.skill.deleteMany({ where: { id: { in: [sql.id, excel.id] } } });
    await db.title.deleteMany({ where: { id: title.id } });
  }
});

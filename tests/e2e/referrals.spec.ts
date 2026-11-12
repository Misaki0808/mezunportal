import { loginAs } from './login';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect, test } from './fixture';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
const login = loginAs;

test('390 px: mezun beyanı, öğrenci ve yönetici onayı; işe kabul ikinci onay zinciri', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const organization = `Örnek Kurum ${suffix}`;
  const student = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.student.email },
  });
  const alumni = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.alumniMentor.email },
  });
  const prior = await db.contactRequest.findFirst({
    where: {
      requesterId: student.id,
      targetId: alumni.id,
      status: { in: ['PENDING', 'APPROVED'] },
    },
  });
  if (prior && prior.status !== 'APPROVED')
    throw new Error('seed çifti için bekleyen iletişim talebi var');
  const contact =
    prior ??
    (await db.contactRequest.create({
      data: {
        requesterId: student.id,
        targetId: alumni.id,
        status: 'APPROVED',
        fields: ['EMAIL'],
        decidedAt: new Date(),
      },
    }));
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })),
  );
  const [mentorPage, studentPage, adminPage] = await Promise.all(contexts.map((c) => c.newPage()));
  let claimId: string | undefined;
  try {
    await login(mentorPage!, 'alumniMentor');
    await mentorPage!.goto('/referans/yeni');
    await expect(mentorPage!.locator('[data-hydrated=true]')).toBeVisible();
    await mentorPage!.getByLabel('Öğrenci').selectOption(student.id);
    await mentorPage!.getByLabel('Kurum adı').fill(organization);
    await mentorPage!.getByLabel('Kısa not').fill('Öğrenciyi ekip çalışması için önerdim.');
    await mentorPage!.getByRole('button', { name: 'Beyan gönder' }).click();
    await mentorPage!.waitForURL('**/hesap/referanslar');
    const claim = await db.referralClaim.findFirstOrThrow({
      where: { alumnusId: alumni.id, studentId: student.id, organizationName: organization },
    });
    claimId = claim.id;
    expect(await db.pointEntry.count({ where: { sourceId: claim.id } })).toBe(0);
    await login(studentPage!, 'student');
    await studentPage!.goto('/hesap/referanslar');
    const studentCard = studentPage!.locator('li').filter({ hasText: organization });
    await expect(studentPage!.locator('[data-hydrated=true]')).toBeVisible();
    await studentCard.getByRole('button', { name: 'Onayla' }).click();
    await expect(studentCard.getByText('Yönetici onayı bekleniyor')).toBeVisible();
    await login(adminPage!, 'systemAdmin');
    await adminPage!.goto('/yonetim/referanslar');
    await expect(adminPage!.locator('[data-hydrated=true]')).toBeVisible();
    await adminPage!
      .locator('li')
      .filter({ hasText: organization })
      .getByRole('button', { name: 'Onayla' })
      .click();
    await adminPage!.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click();
    await expect
      .poll(
        async () => (await db.referralClaim.findUniqueOrThrow({ where: { id: claim.id } })).status,
      )
      .toBe('APPROVED');
    await studentPage!.reload();
    await expect(studentPage!.locator('[data-hydrated=true]')).toBeVisible();
    await studentCard.getByRole('button', { name: 'İşe kabul edildim' }).click();
    await expect(studentCard.getByText('Mezun onayı bekleniyor')).toBeVisible();
    await mentorPage!.reload();
    await expect(mentorPage!.locator('[data-hydrated=true]')).toBeVisible();
    await mentorPage!
      .locator('li')
      .filter({ hasText: organization })
      .getByRole('button', { name: 'Onayla' })
      .click();
    await expect(
      mentorPage!
        .locator('li')
        .filter({ hasText: organization })
        .getByText('Kabul için yönetici onayı bekleniyor'),
    ).toBeVisible();
    await adminPage!.reload();
    await expect(adminPage!.locator('[data-hydrated=true]')).toBeVisible();
    await adminPage!
      .locator('li')
      .filter({ hasText: organization })
      .getByRole('button', { name: 'Onayla' })
      .click();
    await adminPage!.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click();
    await expect
      .poll(
        async () => (await db.referralClaim.findUniqueOrThrow({ where: { id: claim.id } })).status,
      )
      .toBe('ACCEPTED_APPROVED');
    expect(await db.pointEntry.count({ where: { sourceId: claim.id, status: 'PENDING' } })).toBe(2);
    for (const page of [mentorPage!, studentPage!, adminPage!])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    if (claimId) {
      await db.notificationIntent.deleteMany({ where: { key: { contains: claimId } } });
      await db.pointEntry.deleteMany({ where: { sourceId: claimId } });
      await db.referralClaim.deleteMany({ where: { id: claimId } });
    }
    if (!prior) await db.contactRequest.deleteMany({ where: { id: contact.id } });
  }
});

import { expect, test } from '@playwright/test';
import { loginAs } from './login';
import messages from '../../messages/tr.json' with { type: 'json' };

const NOT_FOUND = messages.ui.errorState.expected.RESOURCE_NOT_FOUND;
const UNKNOWN = '018f0000-0000-7000-8000-000000000000';

for (const routes of [
  ['/hesap/gorusme', '/randevular', '/randevu-al'],
  ['/hikayeler', '/ilanlar', '/uye'],
  ['/deneyim', '/etkinlikler'],
]) {
  test(`girişli ayrıntı rotalarında olmayan kayıt 404 döner: ${routes.join(', ')}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'student');
    for (const route of routes) {
      const path = `${route}/${UNKNOWN}`;
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByText(NOT_FOUND), path).toBeVisible();
      await expect(page.locator('main form'), path).toHaveCount(0);
    }
  });
}

test('yabancı ve olmayan kayıtlar altı rotada aynı 404 ekranını verir', async ({ page }) => {
  test.setTimeout(120_000);
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import('../../src/generated/prisma/client');
  const { createInstitution, createUser, addMembership } = await import('../../src/test/fixtures');
  const { seedUserId } = await import('../../prisma/seed-accounts');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const inst = await createInstitution(db);
  const foreignId = await createUser(db, { name: 'Gizli Kanıt Kişisi' });
  const adminId = seedUserId('academic');
  await addMembership(db, {
    userId: foreignId,
    departmentId: inst.deptA1,
    role: 'ALUMNI',
    graduationYear: 2020,
    verifiedById: adminId,
  });
  await db.mentorProfile.create({
    data: {
      userId: foreignId,
      isActive: true,
      monthlyCapacity: 4,
      sessionMinutes: 30,
      meetingModes: ['ONLINE'],
    },
  });
  const story = await db.alumniStory.create({
    data: {
      userId: foreignId,
      departmentId: inst.deptA1,
      body: 'Gizli kanıt hikâyesi',
      status: 'DRAFT',
    },
  });
  const posting = await db.jobPosting.create({
    data: {
      authorId: foreignId,
      departmentIdAtWrite: inst.deptA1,
      title: 'Gizli kanıt ilanı',
      status: 'DRAFT',
    },
  });
  const experience = await db.experience.create({
    data: {
      authorId: foreignId,
      departmentIdAtWrite: inst.deptA1,
      type: 'INTERNSHIP',
      organizationName: 'Gizli kanıt deneyimi',
      status: 'DRAFT',
    },
  });
  const now = Date.now();
  const appointment = await db.appointment.create({
    data: {
      mentorId: foreignId,
      menteeId: adminId,
      startsAt: new Date(now + 3600000),
      endsAt: new Date(now + 5400000),
      expiresAt: new Date(now + 1800000),
      mode: 'ONLINE',
    },
  });
  try {
    await loginAs(page, 'student');
    for (const [base, id] of [
      ['/randevular', appointment.id],
      ['/randevu-al', foreignId],
      ['/hikayeler', story.id],
      ['/ilanlar', posting.id],
      ['/uye', foreignId],
      ['/deneyim', experience.id],
    ]) {
      const missing = await page.goto(`${base}/${UNKNOWN}`);
      expect(missing?.status(), base).toBe(404);
      const missingText = await page.locator('main').innerText();
      const foreign = await page.goto(`${base}/${id}`);
      expect(foreign?.status(), base).toBe(404);
      const body = await foreign!.text();
      expect(body).not.toContain('Gizli Kanıt Kişisi');
      expect(body).not.toContain('Gizli kanıt');
      expect(await page.locator('main').innerText(), base).toBe(missingText);
    }
    await loginAs(page, 'academic');
    const own = await page.goto(`/randevular/${appointment.id}`);
    expect(own?.status()).toBe(200);
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  } finally {
    await db.appointment.delete({ where: { id: appointment.id } });
    await db.alumniStory.delete({ where: { id: story.id } });
    await db.jobPosting.delete({ where: { id: posting.id } });
    await db.experience.delete({ where: { id: experience.id } });
    await db.mentorProfile.delete({ where: { userId: foreignId } });
    await db.membership.deleteMany({ where: { userId: foreignId } });
    await db.user.delete({ where: { id: foreignId } });
    await db.department.deleteMany({ where: { faculty: { universityId: inst.universityId } } });
    await db.faculty.deleteMany({ where: { universityId: inst.universityId } });
    await db.university.delete({ where: { id: inst.universityId } });
    await db.$disconnect();
  }
});

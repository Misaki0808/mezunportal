import { expect, test } from './fixture';
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

test('düzenlemede yabancı ve olmayan kayıt gerçek 404, kendi taslağı formdur', async ({ page }) => {
  test.setTimeout(120_000);
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import('../../src/generated/prisma/client');
  const { createUser, addMembership } = await import('../../src/test/fixtures');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
    include: { memberships: true },
  });
  const alumni = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
    include: { memberships: true },
  });
  const departmentId = student.memberships[0]!.departmentId;
  const otherStudent = await createUser(db, { name: 'Gizli Test Sahibi' });
  const otherAlumni = await createUser(db, { name: 'Gizli Test Sahibi' });
  await addMembership(db, { userId: otherStudent, departmentId, role: 'STUDENT', entryYear: 2024 });
  await addMembership(db, {
    userId: otherAlumni,
    departmentId,
    role: 'ALUMNI',
    graduationYear: 2020,
  });
  const foreignExperience = await db.experience.create({
    data: {
      authorId: otherStudent,
      departmentIdAtWrite: departmentId,
      type: 'INTERNSHIP',
      organizationName: 'Gizli Test Deneyimi',
      status: 'DRAFT',
    },
  });
  const ownExperience = await db.experience.create({
    data: {
      authorId: student.id,
      departmentIdAtWrite: departmentId,
      type: 'INTERNSHIP',
      organizationName: 'Benim Deneyimim',
      status: 'DRAFT',
    },
  });
  const publishedFields = {
    departmentIdAtWrite: departmentId,
    type: 'INTERNSHIP' as const,
    organizationName: 'Yayında Test Deneyimi',
    status: 'PUBLISHED' as const,
    termYear: 2025,
    termSeason: 'SUMMER' as const,
    durationWeeks: 4,
    pay: 'PAID' as const,
    applicationChannel: 'OTHER' as const,
    whatLearned: 'Öğrenilenler',
    advice: 'Öneriler',
    moderatedById: student.id,
    moderatedAt: new Date(),
    publishedAt: new Date(),
  };
  const foreignPublished = await db.experience.create({
    data: { ...publishedFields, authorId: otherStudent },
  });
  const ownPublished = await db.experience.create({
    data: { ...publishedFields, authorId: student.id },
  });
  const foreignJob = await db.jobPosting.create({
    data: {
      authorId: otherAlumni,
      departmentIdAtWrite: departmentId,
      title: 'Gizli Test İlanı',
      status: 'DRAFT',
    },
  });
  const ownJob = await db.jobPosting.create({
    data: {
      authorId: alumni.id,
      departmentIdAtWrite: departmentId,
      title: 'Benim İlanım',
      status: 'DRAFT',
    },
  });
  const compare = async (base: string, foreignId: string) => {
    const missing = await page.goto(`${base}/${UNKNOWN}/duzenle`);
    expect(missing?.status(), base).toBe(404);
    const expected = await page.locator('main').innerText();
    const foreign = await page.goto(`${base}/${foreignId}/duzenle`);
    expect(foreign?.status(), base).toBe(404);
    expect(await page.locator('main').innerText(), base).toBe(expected);
    const html = await foreign!.text();
    expect(html).not.toContain('Gizli Test');
    expect(html).not.toContain('Yayında Test Deneyimi');
    await expect(page.locator('main form')).toHaveCount(0);
  };
  try {
    await loginAs(page, 'student');
    await compare('/deneyim', foreignExperience.id);
    await compare('/deneyim', foreignPublished.id);
    const missingHtml = await (await page.goto(`/deneyim/${UNKNOWN}/duzenle`))!.text();
    const publishedHtml = await (await page.goto(
      `/deneyim/${foreignPublished.id}/duzenle`,
    ))!.text();
    // Ortak mesaj kataloğu her iki yanıtta bulunur; kayda özgü ek metin ise sızmamalı.
    const phrases = [
      messages.experiences.form.notEditableTitle,
      messages.experiences.form.notEditableDescription,
    ];
    const count = (text: string, phrase: string) => text.split(phrase).length - 1;
    for (const phrase of phrases)
      expect(count(publishedHtml, phrase)).toBe(count(missingHtml, phrase));
    const publishedRsc = await page.request.get(
      `/deneyim/${foreignPublished.id}/duzenle?_rsc=review`,
      {
        headers: { RSC: '1' },
      },
    );
    expect(publishedRsc.headers()['content-type']).toContain('text/x-component');
    const missingRsc = await page.request.get(`/deneyim/${UNKNOWN}/duzenle?_rsc=review`, {
      headers: { RSC: '1' },
    });
    expect(missingRsc.headers()['content-type']).toContain('text/x-component');
    const [payload, missingPayload] = await Promise.all([publishedRsc.text(), missingRsc.text()]);
    for (const phrase of phrases)
      expect(count(payload, phrase)).toBe(count(missingPayload, phrase));
    expect((await page.goto(`/deneyim/${ownExperience.id}/duzenle`))?.status()).toBe(200);
    await expect(page.locator('main form')).toBeVisible();
    const ownPublishedResponse = await page.goto(`/deneyim/${ownPublished.id}/duzenle`);
    expect(ownPublishedResponse?.status()).toBe(200);
    await expect(page.locator('main form')).toHaveCount(0);
    await expect(page.getByText(messages.experiences.form.notEditableTitle)).toBeVisible();
    const ownPublishedHtml = await ownPublishedResponse!.text();
    for (const phrase of phrases)
      expect(count(ownPublishedHtml, phrase)).toBeGreaterThan(count(missingHtml, phrase));
    expect((await page.goto(`/ilanlar/${foreignJob.id}/duzenle`))?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: messages.ui.errorState.expected.AUTH_FORBIDDEN }),
    ).toBeVisible();
    await loginAs(page, 'alumniMentor');
    await compare('/ilanlar', foreignJob.id);
    expect((await page.goto(`/ilanlar/${ownJob.id}/duzenle`))?.status()).toBe(200);
    await expect(page.getByRole('textbox', { name: /Pozisyon adı/ })).toHaveValue('Benim İlanım');
    await loginAs(page, 'systemAdmin');
    await compare('/deneyim', foreignExperience.id);
  } finally {
    await db.experience.deleteMany({
      where: {
        id: { in: [foreignExperience.id, ownExperience.id, foreignPublished.id, ownPublished.id] },
      },
    });
    await db.jobPosting.deleteMany({ where: { id: { in: [foreignJob.id, ownJob.id] } } });
    await db.membership.deleteMany({ where: { userId: { in: [otherStudent, otherAlumni] } } });
    await db.user.deleteMany({ where: { id: { in: [otherStudent, otherAlumni] } } });
    await db.$disconnect();
  }
});

test('SSS, şirket ve yönetim etkinliğinde bulunamayan kayıt gerçek 404', async ({ page }) => {
  test.setTimeout(120_000);
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import('../../src/generated/prisma/client');
  const { createInstitution } = await import('../../src/test/fixtures');
  const { randomUUID } = await import('node:crypto');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
    include: { memberships: true },
  });
  const ownDepartment = student.memberships[0]!.departmentId;
  const foreign = await createInstitution(db);
  const makeFaq = async (departmentId: string, text: string) => {
    const request = await db.faqRequest.create({
      data: { departmentIdAtWrite: departmentId, question: text },
    });
    const item = await db.faqItem.create({
      data: {
        sourceRequestId: request.id,
        departmentIdAtWrite: departmentId,
        question: text,
        answer: 'Örnek yanıt',
      },
    });
    return { request, item };
  };
  const ownFaq = await makeFaq(ownDepartment, 'Kendi üniversitemde örnek soru');
  const foreignFaq = await makeFaq(foreign.deptA1, 'Gizli yabancı üniversite sorusu');
  const company = await db.company.create({
    data: { name: 'Örnek Şirket 476', normalizedName: `ornek-sirket-${randomUUID()}`, aliases: [] },
  });
  const makeEvent = (departmentId: string, title: string) =>
    db.campusEvent.create({
      data: {
        title,
        description: 'Örnek etkinlik açıklaması',
        location: 'Salon',
        startsAt: new Date('2040-01-01T10:00:00Z'),
        endsAt: new Date('2040-01-01T11:00:00Z'),
        capacity: 20,
        departments: { create: { departmentId } },
      },
    });
  const ownEvent = await makeEvent(ownDepartment, 'Kendi yönetim etkinliği');
  const foreignEvent = await makeEvent(foreign.deptA1, 'Gizli yabancı etkinlik');
  const compare = async (foreignPath: string, missingPath: string) => {
    const missing = await page.goto(missingPath);
    expect(missing?.status(), missingPath).toBe(404);
    const text = await page.locator('main').innerText();
    const hidden = await page.goto(foreignPath);
    expect(hidden?.status(), foreignPath).toBe(404);
    expect(await page.locator('main').innerText(), foreignPath).toBe(text);
    expect(await hidden!.text()).not.toContain('Gizli yabancı');
  };
  try {
    await loginAs(page, 'student');
    await compare(`/sss/${foreignFaq.item.id}`, `/sss/${UNKNOWN}`);
    expect((await page.goto(`/sss/${ownFaq.item.id}`))?.status()).toBe(200);
    await expect(page.getByText('Kendi üniversitemde örnek soru')).toBeVisible();
    await compare(`/sirketler/olmayan-${randomUUID()}`, `/sirketler/olmayan-${UNKNOWN}`);
    expect((await page.goto(`/sirketler/ornek-${company.id}`))?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Örnek Şirket 476' })).toBeVisible();
    await loginAs(page, 'departmentAdmin');
    await compare(`/yonetim/etkinlikler/${foreignEvent.id}`, `/yonetim/etkinlikler/${UNKNOWN}`);
    expect((await page.goto(`/yonetim/etkinlikler/${ownEvent.id}`))?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Katılım ekranı' })).toBeVisible();
    await loginAs(page, 'student');
    expect((await page.goto(`/yonetim/etkinlikler/${ownEvent.id}`))?.status()).toBe(404);
  } finally {
    await db.campusEvent.deleteMany({ where: { id: { in: [ownEvent.id, foreignEvent.id] } } });
    await db.faqItem.deleteMany({ where: { id: { in: [ownFaq.item.id, foreignFaq.item.id] } } });
    await db.faqRequest.deleteMany({
      where: { id: { in: [ownFaq.request.id, foreignFaq.request.id] } },
    });
    await db.company.delete({ where: { id: company.id } });
    await db.department.deleteMany({ where: { faculty: { universityId: foreign.universityId } } });
    await db.faculty.deleteMany({ where: { universityId: foreign.universityId } });
    await db.university.delete({ where: { id: foreign.universityId } });
    await db.$disconnect();
  }
});

import { expect, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { waitForHydratedForm } from './hydration';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
async function evidence(page: Page, name: string) {
  const root = process.env.SEEKER_EVIDENCE_DIR;
  if (!root) return;
  await mkdir(root, { recursive: true });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: path.join(root, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
async function login(page: Page, persona: 'student' | 'alumniMentor') {
  await page.goto(`/giris/test?persona=${persona}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Test hesabıyla giriş yap' }).click();
  await page.waitForURL(/\/(hesap|onay)$/);
  await page.goto('/onay');
  await waitForHydratedForm(page, 'Seçimlerimi kaydet');
  const required = page.getByRole('checkbox', { name: 'Okudum ve onaylıyorum.', exact: true });
  await required.nth(0).check();
  await required.nth(1).check();
  await page.getByRole('button', { name: 'Seçimlerimi kaydet' }).click();
  await expect(page.getByText('Onayların kaydedildi.').first()).toBeVisible();
}
test('öğrenci rıza verir, mezun anonim kartı bulur, talep onaylanınca kimlik açılır', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const student = await db.user.findUniqueOrThrow({
    where: { email: 'student@test.mezunportal.local' },
  });
  const alumni = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const studentProfile = await db.profile.findUnique({ where: { userId: student.id } });
  const alumniProfile = await db.profile.findUnique({ where: { userId: alumni.id } });
  const oldConsent = await db.consent.findFirst({
    where: { userId: student.id, documentType: 'JOB_SEEKER_VISIBILITY' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { version: true, granted: true },
  });
  const oldRequests = await db.contactRequest.findMany({
    where: { requesterId: alumni.id, targetId: student.id },
    select: { id: true, status: true },
  });
  if (oldRequests.some((r) => r.status === 'PENDING' || r.status === 'APPROVED'))
    throw new Error('Test hesapları arasında açık iletişim talebi var');
  await db.profile.upsert({
    where: { userId: student.id },
    create: { userId: student.id, headline: 'Veri analizi ve ürün geliştirme' },
    update: { headline: 'Veri analizi ve ürün geliştirme' },
  });
  const contexts = await Promise.all(
    [0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })),
  );
  const [studentPage, alumniPage] = await Promise.all(contexts.map((ctx) => ctx.newPage()));
  try {
    await login(studentPage!, 'student');
    await studentPage!.goto('/hesap/staj-ariyorum');
    await studentPage!.waitForLoadState('networkidle');
    const visibility = studentPage!.getByRole('switch', { name: /İş arayanlara görün/ });
    if (!(await visibility.isChecked())) await visibility.check();
    const consent = studentPage!.getByRole('checkbox', { name: /Metni okudum/ });
    if (!(await consent.isChecked())) await consent.check();
    await studentPage!.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(
      studentPage!.getByRole('status').filter({ hasText: 'Tercihin kaydedildi.' }),
    ).toBeVisible();
    await evidence(studentPage!, 'ayar');
    await login(alumniPage!, 'alumniMentor');
    await alumniPage!.goto('/adaylar');
    await alumniPage!.waitForLoadState('networkidle');
    const hiring = alumniPage!.getByRole('switch', { name: /İşe alım yapıyorum/ });
    if (!(await hiring.isChecked())) await hiring.click();
    await expect(alumniPage!.getByRole('button', { name: 'Aday ara' })).toBeVisible();
    await alumniPage!.getByRole('button', { name: 'Aday ara' }).click();
    const card = alumniPage!.locator('li').filter({ hasText: 'Veri analizi ve ürün geliştirme' });
    await expect(card).toBeVisible();
    await evidence(alumniPage!, 'arama');
    expect(await alumniPage!.content()).not.toContain(student.email);
    expect(await alumniPage!.content()).not.toContain(student.id);
    expect(await alumniPage!.content()).not.toContain(student.name);
    await card.getByRole('link', { name: 'İletişim iste' }).click();
    await alumniPage!.waitForURL(/\/adaylar\/[^/]+\/iletisim$/);
    await expect(alumniPage!.getByRole('checkbox', { name: 'E-posta' })).toBeVisible();
    await evidence(alumniPage!, 'iletisim');
    await alumniPage!.getByRole('checkbox', { name: 'E-posta' }).check();
    await alumniPage!.getByRole('button', { name: 'İstek gönder' }).click();
    await expect(
      alumniPage!.getByRole('status').filter({ hasText: 'İletişim isteğin gönderildi.' }),
    ).toBeVisible();
    await alumniPage!.getByRole('link', { name: 'Taleplerime git' }).click();
    await expect(
      alumniPage!.getByText('Aday: Veri analizi ve ürün geliştirme', { exact: false }),
    ).toBeVisible();
    expect(await alumniPage!.content()).not.toContain(student.name);
    await studentPage!.goto('/hesap/iletisim?box=INCOMING');
    await studentPage!.waitForLoadState('networkidle');
    const request = studentPage!.locator('div.rounded-card').filter({ hasText: alumni.name });
    await expect(request).toBeVisible();
    await request.getByRole('button', { name: 'Onayla' }).click();
    await expect(request.getByRole('button', { name: 'Onayı geri al' })).toBeVisible();
    await alumniPage!.reload();
    await expect(alumniPage!.getByRole('heading', { name: student.name })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((ctx) => ctx.close()));
    await db.contactRequest.deleteMany({
      where: {
        requesterId: alumni.id,
        targetId: student.id,
        id: { notIn: oldRequests.map((r) => r.id) },
      },
    });
    await db.consent.create({
      data: {
        userId: student.id,
        documentType: 'JOB_SEEKER_VISIBILITY',
        version: oldConsent?.version ?? 'taslak-1',
        granted: oldConsent?.granted ?? false,
      },
    });
    await db.profile.update({
      where: { userId: student.id },
      data: {
        headline: studentProfile?.headline ?? null,
        seekingInternship: studentProfile?.seekingInternship ?? false,
        seekerRef: studentProfile?.seekerRef ?? null,
        seekerViewCount: studentProfile?.seekerViewCount ?? 0,
        seekingTermYear: studentProfile?.seekingTermYear ?? null,
        seekingTermSeason: studentProfile?.seekingTermSeason ?? null,
      },
    });
    await db.profile.updateMany({
      where: { userId: alumni.id },
      data: { hiringDeclaredAt: alumniProfile?.hiringDeclaredAt ?? null },
    });
  }
});

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { expect, test } from './fixture';
import { loginAs } from './login';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

test('özetler eşiği geçince doğru kişide görünür; tekil yanıt karşı tarafa açılmaz', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const getUser = (local: string) =>
    db.user.findUniqueOrThrow({ where: { email: `${local}@test.mezunportal.local` } });
  const [student, mentor, senior, academic] = await Promise.all([
    getUser('student'),
    getUser('alumni-mentor'),
    getUser('senior-mentor'),
    getUser('academic'),
  ]);
  const ids: string[] = [];
  let sequence = 0;
  const add = async (
    mentorId: string,
    menteeId: string,
    authorId: string,
    ratingHalf: number,
    note: string,
  ) => {
    const start = new Date(Date.UTC(2003, 0, 1 + sequence++, 10));
    const row = await db.appointment.create({
      data: {
        mentorId,
        menteeId,
        status: 'COMPLETED',
        startsAt: start,
        endsAt: new Date(start.getTime() + 3600000),
        expiresAt: new Date(start.getTime() - 86400000),
        decidedAt: new Date(start.getTime() - 90000000),
        mode: 'ONLINE',
      },
    });
    ids.push(row.id);
    await db.sessionFeedback.create({
      data: {
        appointmentId: row.id,
        authorId,
        happened: true,
        answerOne: 'POSITIVE',
        answerTwo: 'POSITIVE',
        answerThree: 'POSITIVE',
        ratingHalf,
        note,
      },
    });
  };
  try {
    await add(mentor.id, student.id, student.id, 10, 'OGRENCIKORUNMUS573');
    await add(mentor.id, senior.id, senior.id, 8, 'DIGERKORUNMUS573');
    await loginAs(page, 'student');
    await page.goto('/mentorlar', { waitUntil: 'networkidle' });
    let card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: mentor.name, exact: true }) })
      .first();
    await expect(card.getByText(/değerlendirme/)).toHaveCount(0);
    await add(mentor.id, academic.id, academic.id, 9, 'UCUNCUKORUNMUS573');
    await page.reload({ waitUntil: 'networkidle' });
    card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: mentor.name, exact: true }) })
      .first();
    await expect(card.getByText('4,5 (3 değerlendirme)')).toBeVisible();
    await page.goto(`/uye/${mentor.id}`, { waitUntil: 'networkidle' });
    await expect(page.getByText('4,5 (3 değerlendirme)')).toBeVisible();
    expect(await page.content()).not.toContain('OGRENCIKORUNMUS573');
    await add(senior.id, student.id, senior.id, 8, 'MENTORKORUNMUS573');
    await add(academic.id, student.id, academic.id, 10, 'IKINCIMENTOR573');
    const start = new Date(Date.now() + 30 * 86400000);
    const request = await db.appointment.create({
      data: {
        mentorId: mentor.id,
        menteeId: student.id,
        status: 'REQUESTED',
        startsAt: start,
        endsAt: new Date(start.getTime() + 3600000),
        expiresAt: new Date(Date.now() + 86400000),
        mode: 'ONLINE',
      },
    });
    ids.push(request.id);
    await page.goto(`/randevular/${request.id}`, { waitUntil: 'networkidle' });
    await expect(page.getByText(/Önceki 2 görüşmenin/)).toHaveCount(0);
    await loginAs(page, 'alumniMentor');
    await page.goto(`/randevular/${request.id}`, { waitUntil: 'networkidle' });
    await expect(page.getByText(/Önceki 2 görüşmenin 2 tanesinde istekli bulundu/)).toBeVisible();
    expect(await page.content()).not.toContain('MENTORKORUNMUS573');
    await page.goto('/profil', { waitUntil: 'networkidle' });
    await expect(page.getByText('4,5 (3 değerlendirme)')).toBeVisible();
    await loginAs(page, 'departmentAdmin');
    await page.goto('/yonetim/gorusme-geri-bildirimleri', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Görüşme geri bildirimleri' })).toBeVisible();
    await expect(page.getByText('Not: MENTORKORUNMUS573')).toBeVisible();
    if (process.env.FEEDBACK_EVIDENCE_DIR) {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.screenshot({
          path: `${process.env.FEEDBACK_EVIDENCE_DIR}/yonetim-${width}.png`,
          fullPage: true,
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
      }
    }
  } finally {
    await db.appointment.deleteMany({ where: { id: { in: ids } } });
  }
});

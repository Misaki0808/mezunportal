import { loginAs } from './login';
import { randomUUID } from 'node:crypto';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { expect, test } from './fixture';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { waitForHydratedControl, waitForHydratedForm } from './hydration';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());
const login = loginAs;
test('mezun ilan verir, yönetici yayımlar ve öğrenci bulur', async ({ browser }) => {
  test.setTimeout(120_000);
  const title = `Staj ${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const originalWriter = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })),
  );
  const [alumni, admin, student] = await Promise.all(contexts.map((c) => c.newPage()));
  let postingId: string | undefined;
  const tag = await db.tag.findUniqueOrThrow({
    where: { kind_slug: { kind: 'INTEREST', slug: 'software' } },
  });
  const seededStudent = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.student.email },
    select: { id: true },
  });
  const profile = await db.profile.upsert({
    where: { userId: seededStudent.id },
    create: { userId: seededStudent.id },
    update: {},
  });
  const initialIntents = await db.notificationIntent.findMany({
    where: { userId: seededStudent.id, kind: 'jobMatch' },
    select: { id: true },
  });
  const hadTag = await db.profileTag.findUnique({
    where: { profileId_tagId: { profileId: profile.id, tagId: tag.id } },
  });
  await db.profileTag.upsert({
    where: { profileId_tagId: { profileId: profile.id, tagId: tag.id } },
    create: { profileId: profile.id, tagId: tag.id },
    update: {},
  });
  // Bildirim kutusu sayısı belirli olsun: önceki koşulardan kalan kayıtlar rozeti kaydırmasın.
  await db.inAppNotification.deleteMany({ where: { userId: seededStudent.id } });
  try {
    await db.user.update({
      where: { id: originalWriter.id },
      data: { name: `İlanYazarı ${randomUUID().replaceAll('-', '')}` },
    });
    await login(alumni!, 'alumniMentor');
    await alumni!.goto('/hesap');
    await expect(
      alumni!.getByRole('region', { name: 'STAJ VE İŞ' }).getByRole('link', { name: /İlanlarım/ }),
    ).toBeVisible();
    await alumni!.goto('/ilanlar/yeni');
    await waitForHydratedControl(alumni!, 'Devam et');
    await alumni!.getByLabel('Pozisyon adı').fill(title);
    await alumni!.getByLabel('Kurum adı').fill('Örnek Teknoloji');
    await alumni!.getByRole('button', { name: 'Devam et' }).click();
    await alumni!
      .getByLabel('Açıklama')
      .fill(
        'Öğrenciler için ekip çalışması ve yazılım geliştirme odaklı örnek bir staj fırsatıdır.',
      );
    await alumni!.getByLabel('Konum', { exact: true }).fill('İstanbul');
    const now = new Date();
    now.setUTCDate(now.getUTCDate() + 20);
    await alumni!.getByLabel('Son başvuru tarihi').fill(now.toISOString().slice(0, 10));
    await alumni!
      .getByRole('checkbox', { name: /Yönetim Bilişim Sistemleri/ })
      .first()
      .check();
    await alumni!.getByRole('checkbox', { name: 'Yazılım geliştirme' }).check();
    await alumni!.getByLabel('HTTPS başvuru bağlantısı').fill('https://example.org/staj');
    await alumni!.getByRole('button', { name: 'Devam et' }).click();
    await alumni!.getByRole('button', { name: 'İncelemeye gönder' }).click();
    await alumni!.waitForURL('**/ilanlarim');
    await expect(alumni!.getByText(title)).toBeVisible();
    await expect(
      alumni!.locator('li').filter({ hasText: title }).getByText('İncelemede', { exact: true }),
    ).toBeVisible();
    const record = await db.jobPosting.findFirstOrThrow({ where: { title } });
    postingId = record.id;
    await login(admin!, 'systemAdmin');
    await admin!.goto('/yonetim/ilanlar');
    const card = admin!.locator('li').filter({ hasText: title });
    await expect(card.locator('xpath=ancestor::*[@data-hydrated][1]')).toHaveAttribute(
      'data-hydrated',
      'true',
    );
    await card.getByRole('button', { name: 'Yayımla' }).click();
    await admin!.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click();
    await expect(card).toHaveCount(0);
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id: postingId } })).status).toBe(
      'PUBLISHED',
    );
    await login(student!, 'student');
    await db.jobPosting.update({ where: { id: postingId }, data: { location: 'K'.repeat(90) } });
    await student!.goto('/');
    await expect(student!.getByRole('heading', { name: 'Sana uyan ilanlar' })).toBeVisible();
    await expect(student!.getByRole('link', { name: new RegExp(title) })).toBeVisible();
    // Bildirim kutusu (P2-05): yayınla eşleşen öğrencide rozet → liste → ilana git; ilanı yazan kendi "yayında" bildirimini görür.
    const bell = student!.getByRole('link', { name: 'Bildirimler, 1 okunmamış' });
    await expect(bell).toBeVisible();
    await bell.click();
    await student!.waitForURL('**/bildirimler');
    const inboxRow = student!.getByRole('link', { name: /Profiline uyan yeni bir ilan var/ });
    await expect(inboxRow).toContainText('Okunmadı');
    await expect(inboxRow).toHaveAttribute('href', `/ilanlar/${postingId}`);
    await inboxRow.click();
    await student!.waitForURL(`**/ilanlar/${postingId}`);
    // Dokunulan bildirim okundu olur: rozet söner (sayı küçük bir GET ile tazelenir, sayfa yenilenmez).
    await expect(student!.getByRole('link', { name: 'Bildirimler', exact: true })).toBeVisible();
    expect(
      await db.inAppNotification.count({ where: { userId: seededStudent.id, readAt: null } }),
    ).toBe(0);
    await alumni!.goto('/bildirimler');
    await expect(alumni!.getByText(/lanın yayında\./).first()).toBeVisible();
    await student!.goto('/');
    // Uygulama içi bildirimler tek yerdedir: tercih ekranında düz eşleşme geçmişi yok, kutuya bağlantı var.
    await student!.goto('/hesap/bildirimler');
    await expect(
      student!.getByRole('heading', { name: 'Sana uyan ilan bildirimleri' }),
    ).toHaveCount(0);
    await expect(student!.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
    await student!.getByRole('link', { name: /Bildirim kutun/ }).click();
    await student!.waitForURL('**/bildirimler');
    await expect(
      student!.getByRole('link', { name: /Profiline uyan yeni bir ilan var/ }),
    ).toBeVisible();
    await student!.setViewportSize({ width: 360, height: 780 });
    await student!.goto('/ilanlar');
    await student!.getByLabel('Pozisyon veya kurum ara').fill(title);
    await student!.getByRole('button', { name: 'Ara', exact: true }).click();
    await expect(student!.getByRole('heading', { name: title })).toBeVisible();
    expect(await student!.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await student!.setViewportSize({ width: 390, height: 844 });
    await student!.getByRole('heading', { name: title }).getByRole('link').click();
    await student!.waitForURL(`**/ilanlar/${postingId}`);
    await expect(student!.getByText('Neden sana uygun?')).toBeVisible();
    await expect(student!.getByText('Yazılım geliştirme', { exact: true })).toBeVisible();
    const apply = student!.getByRole('link', { name: /Başvur/ });
    await expect(apply).toHaveAttribute('href', 'https://example.org/staj');
    await expect(apply).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(student!.getByRole('link', { name: 'İlan ver' })).toHaveCount(0);
    // Aynı yayın için D7 yöntemini sınayan sentetik senaryo: yazar kimliği HTML'e taşınmaz.
    const writer = await db.user.findUniqueOrThrow({ where: { id: record.authorId } });
    await db.jobPosting.update({
      where: { id: postingId },
      data: { applyMethod: 'CONTACT_REQUEST', applyUrl: null },
    });
    await student!.reload();
    await alumni!.goto(`/ilanlar/${postingId}`);
    await expect(
      alumni!.getByText('Bu ilan için şu anda iletişim talebi oluşturulamıyor.'),
    ).toBeVisible();
    await alumni!.goto(`/ilanlar/${postingId}/iletisim`);
    await expect(
      alumni!.getByText('Bu ilan için şu anda iletişim talebi oluşturulamıyor.'),
    ).toBeVisible();
    const html = await student!.content();
    expect(html).not.toContain(writer.id);
    expect(html).not.toContain(writer.name);
    await student!.getByRole('link', { name: 'İletişim iste' }).click();
    await expect(student!.getByText(title)).toBeVisible();
    expect(await student!.content()).not.toContain(writer.id);
    await waitForHydratedForm(student!, 'Talep gönder');
    await student!.getByRole('checkbox', { name: 'E-posta' }).check();
    await student!.getByRole('button', { name: 'Talep gönder' }).click();
    await expect(
      student!.getByRole('status').filter({ hasText: 'Talebin gönderildi' }),
    ).toBeVisible();
    await student!.getByRole('link', { name: 'Taleplerime git' }).click();
    await student!.waitForURL('**/hesap/iletisim?box=OUTGOING');
    // Başka kaynakta bilinen kişi aynı listede bulunabilir; gizlilik bu ilan bağlamında ölçülür.
    const outgoingCard = student!.locator('div.rounded-card').filter({ hasText: title });
    await expect(outgoingCard.getByText('Onay bekliyor', { exact: true })).toBeVisible();
    await expect(outgoingCard).not.toContainText(writer.name);
    await alumni!.goto('/hesap/iletisim?box=INCOMING');
    const requestCard = alumni!.locator('div.rounded-card').filter({ hasText: title });
    await expect(requestCard).toBeVisible();
    await expect(requestCard.locator('xpath=ancestor::*[@data-hydrated][1]')).toHaveAttribute(
      'data-hydrated',
      'true',
    );
    await requestCard.getByRole('button', { name: 'Onayla' }).click();
    await expect(requestCard.getByRole('button', { name: 'Onayı geri al' })).toBeVisible();
    await student!.reload();
    await expect(outgoingCard.getByRole('heading', { name: writer.name })).toBeVisible();
    await requestCard.getByRole('button', { name: 'Onayı geri al' }).click();
    await alumni!.getByRole('dialog').getByRole('button', { name: 'Onayı geri al' }).click();
    await expect(requestCard.getByText('Onay geri alındı')).toBeVisible();
    await student!.reload();
    await expect(outgoingCard.getByText('Onay geri alındı', { exact: true })).toBeVisible();
    await expect(outgoingCard).not.toContainText(writer.name);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await db.notificationIntent.deleteMany({
      where: {
        userId: seededStudent.id,
        kind: 'jobMatch',
        id: { notIn: initialIntents.map((i) => i.id) },
      },
    });
    if (!hadTag)
      await db.profileTag.deleteMany({ where: { profileId: profile.id, tagId: tag.id } });
    await db.user.update({ where: { id: originalWriter.id }, data: { name: originalWriter.name } });
    postingId ??= (await db.jobPosting.findFirst({ where: { title }, select: { id: true } }))?.id;
    if (postingId) {
      await db.contactRequest.deleteMany({ where: { message: { contains: title } } });
      await db.pointEntry.deleteMany({ where: { sourceType: 'JOB_POSTING', sourceId: postingId } });
      await db.jobPosting.deleteMany({ where: { id: postingId } });
    }
  }
});

test('mobil ilk ekranda iki ilan kartı ve erişilebilir filtre alt sayfası görünür', async ({
  page,
}) => {
  const author = await db.user.findUniqueOrThrow({
    where: { email: 'alumni-mentor@test.mezunportal.local' },
  });
  const moderator = await db.user.findUniqueOrThrow({
    where: { email: 'system-admin@test.mezunportal.local' },
  });
  const membership = await db.membership.findFirstOrThrow({
    where: { userId: author.id, endedAt: null },
  });
  const ids: string[] = [];
  try {
    for (const title of ['Yazılım stajyeri', 'Veri analizi stajyeri']) {
      const at = new Date();
      const deadline = new Date(at);
      deadline.setUTCDate(deadline.getUTCDate() + 5);
      const posting = await db.jobPosting.create({
        data: {
          authorId: author.id,
          departmentIdAtWrite: membership.departmentId,
          title,
          organizationName: 'Örnek Teknoloji',
          location: 'İstanbul',
          isRemote: true,
          description: 'Ekip çalışması ve gerçek projelerle öğrenme fırsatı sunan bir staj ilanı.',
          applyMethod: 'URL',
          applyUrl: 'https://example.org/staj',
          deadlineOn: deadline,
          status: 'PUBLISHED',
          submittedAt: at,
          moderatedAt: at,
          moderatedById: moderator.id,
          publishedAt: at,
          targets: { create: { departmentId: membership.departmentId } },
        },
      });
      ids.push(posting.id);
    }
    await login(page, 'student');
    for (const [width, height] of [
      [360, 780],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto('/ilanlar');
      await page.waitForLoadState('networkidle');
      const nav = await page.locator('[data-bottom-nav]').boundingBox();
      for (const id of ids) {
        const article = page
          .locator('article')
          .filter({ has: page.locator(`a[href="/ilanlar/${id}"]`) });
        await expect(article).toBeInViewport({ ratio: 1 });
        const box = await article.boundingBox();
        expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
      }
      const filters = page.getByRole('button', { name: 'Filtreler', exact: true });
      await expect(filters).toBeInViewport({ ratio: 1 });
      await filters.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').getByLabel('Konum', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(filters).toBeFocused();
    }
  } finally {
    await db.jobPosting.deleteMany({ where: { id: { in: ids } } });
  }
});

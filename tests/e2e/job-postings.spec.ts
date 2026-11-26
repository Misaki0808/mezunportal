import { loginAs } from './login';
import { tabForward } from './keyboard';
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
test('ilan taslağında NFD başlık sınırı ve NFC kaydı', async ({ page }) => {
  test.setTimeout(90_000);
  const author = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.alumniMentor.email },
  });
  const normalized = 'İ'.repeat(100);
  let postingId: string | undefined;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'alumniMentor');
    await page.goto('/ilanlar/yeni');
    await waitForHydratedControl(page, 'Taslağı kaydet');
    const title = page.getByLabel('Pozisyon adı');
    const tooLong = 'İ'.normalize('NFD').repeat(121);
    await title.fill(tooLong);
    await page.getByRole('button', { name: 'Taslağı kaydet' }).click();
    await expect(title).toHaveValue(tooLong);
    await expect(title).toBeFocused();
    await expect(title).toHaveAccessibleDescription('En fazla 120 karakter gir.');
    await title.fill('İ'.normalize('NFD').repeat(100));
    const save = page.getByRole('button', { name: 'Taslağı kaydet' });
    await save.click();
    await expect(save).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByText('Taslağın kaydedildi.')).toBeVisible();
    const row = await db.jobPosting.findFirstOrThrow({
      where: { authorId: author.id, title: normalized, status: 'DRAFT' },
    });
    postingId = row.id;
    expect(row.title).toBe(normalized);
  } finally {
    if (postingId) await db.jobPosting.delete({ where: { id: postingId } });
  }
});

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
    await expect(student!.getByRole('heading', { name: 'Sana uygun ilanlar' })).toBeVisible();
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
    await expect(student!.getByRole('link', { name: 'İlan paylaş' })).toHaveCount(0);
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
    await student!.getByRole('button', { name: 'Talep gönder' }).click();
    const contactField = student!.getByRole('checkbox', { name: 'E-posta' });
    await expect(contactField).toBeFocused();
    await expect(contactField).toHaveAttribute('aria-invalid', 'true');
    await expect(contactField).toHaveAccessibleDescription(/en az bir/i);
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

test('öğrenci başka platformdaki ilanı dış bağlantıyla paylaşır; yönetici yayımlar; okuyucu "Bir öğrenci paylaştı" ve kaynağı görür', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const title = `Öğrenci paylaşımı ${randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const source = `https://www.youthall.com/ilan/${randomUUID().slice(0, 8)}`;
  const sharer = await db.user.findUniqueOrThrow({
    where: { email: TEST_PERSONAS.student.email },
    select: { id: true },
  });
  const initialNotes = await db.inAppNotification.findMany({
    where: { userId: sharer.id },
    select: { id: true },
  });
  const initialIntents = await db.notificationIntent.findMany({
    where: { userId: sharer.id },
    select: { id: true },
  });
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })),
  );
  const [student, admin, reader] = await Promise.all(contexts.map((c) => c.newPage()));
  const shots = process.env.R1_SHOT_DIR;
  let postingId: string | undefined;
  try {
    await login(student!, 'student');
    await student!.goto('/ilanlar');
    // Başlık kabul garantisi ima etmez; doğrulanmış öğrenci "İlan paylaş" düğmesini görür.
    await expect(student!.getByText('Bir sonraki adımın burada')).toHaveCount(0);
    // 390 px: kısa açıklama görünür (ilk ekrana iki kart sığar); tam metin 1440 px'te.
    await expect(student!.getByText('Topluluğun paylaştığı, bölüm onaylı ilanlar.')).toBeVisible();
    await expect(student!.getByText(/sen de paylaşabilirsin/)).toBeHidden();
    await expect(student!.getByRole('link', { name: 'İlan paylaş' }).first()).toBeVisible();
    if (shots)
      await student!.screenshot({ path: `${shots}/ogrenci-ilanlar-390.png`, fullPage: true });
    await student!.goto('/hesap');
    await expect(
      student!.getByRole('region', { name: 'STAJ VE İŞ' }).getByRole('link', { name: /İlanlarım/ }),
    ).toBeVisible();
    await student!.goto('/ilanlar/yeni');
    await waitForHydratedControl(student!, 'Devam et');
    await student!.getByLabel('Pozisyon adı').fill(title);
    await student!.getByLabel('Kurum adı').fill('Örnek Teknoloji');
    await student!.getByRole('button', { name: 'Devam et' }).click();
    // Öğrenci iletişim talebiyle ilan yazamaz: başvuru yolu seçimi yok, yalnız ilanın asıl sayfası istenir.
    await expect(student!.getByLabel('Başvuru yolu')).toHaveCount(0);
    await expect(student!.getByText(/başvuru o sayfada yapılır/)).toBeVisible();
    await student!
      .getByLabel('Açıklama')
      .fill('Başka bir platformda gördüğüm, YBS öğrencileri için uygun örnek bir staj ilanı.');
    await student!.getByLabel('Konum', { exact: true }).fill('İstanbul');
    const deadline = new Date();
    deadline.setUTCDate(deadline.getUTCDate() + 20);
    await student!.getByLabel('Son başvuru tarihi').fill(deadline.toISOString().slice(0, 10));
    await student!
      .getByRole('checkbox', { name: /Yönetim Bilişim Sistemleri/ })
      .first()
      .check();
    await student!.getByLabel('İlanın asıl sayfası (https://)').fill(source);
    if (shots) await student!.screenshot({ path: `${shots}/ogrenci-form-390.png`, fullPage: true });
    await student!.getByRole('button', { name: 'Devam et' }).click();
    await student!.getByRole('button', { name: 'İncelemeye gönder' }).click();
    await student!.waitForURL('**/ilanlarim');
    await expect(
      student!.locator('li').filter({ hasText: title }).getByText('İncelemede', { exact: true }),
    ).toBeVisible();
    const record = await db.jobPosting.findFirstOrThrow({ where: { title } });
    postingId = record.id;
    expect(record).toMatchObject({ authorId: sharer.id, applyMethod: 'URL', status: 'PENDING' });
    // Onaysız ilan okuyucuya görünmez.
    await login(reader!, 'alumniMentor');
    await reader!.goto('/ilanlar');
    await reader!.getByLabel('Pozisyon veya kurum ara').fill(title);
    await reader!.getByRole('button', { name: 'Ara', exact: true }).click();
    await expect(reader!.getByRole('heading', { name: title })).toHaveCount(0);
    // Bölüm yöneticisi hedef bağlantıyı ve paylaşanın öğrenci olduğunu görerek yayımlar.
    await login(admin!, 'systemAdmin');
    await admin!.goto('/yonetim/ilanlar');
    const card = admin!.locator('li').filter({ hasText: title });
    await expect(card.locator('xpath=ancestor::*[@data-hydrated][1]')).toHaveAttribute(
      'data-hydrated',
      'true',
    );
    await expect(card).toContainText('(öğrenci)');
    await expect(
      card.getByRole('link', { name: new RegExp(source.replace(/[.]/g, '\\.')) }),
    ).toBeVisible();
    if (shots)
      await admin!.screenshot({ path: `${shots}/yonetici-kuyruk-390.png`, fullPage: true });
    await card.getByRole('button', { name: 'Yayımla' }).click();
    await admin!.getByRole('dialog').getByRole('button', { name: 'Onayla' }).click();
    await expect(card).toHaveCount(0);
    // Okuyucu: kartta tür ve kaynak (www olmadan), ayrıntıda not ve dış bağlantı.
    await reader!.goto('/ilanlar');
    await reader!.getByLabel('Pozisyon veya kurum ara').fill(title);
    await reader!.getByRole('button', { name: 'Ara', exact: true }).click();
    const readerCard = reader!.locator('article').filter({ hasText: title });
    await expect(readerCard.getByText('Bir öğrenci paylaştı')).toBeVisible();
    await expect(readerCard.getByText('Kaynak: youthall.com')).toBeVisible();
    expect(await reader!.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (shots) await reader!.screenshot({ path: `${shots}/okuyucu-kart-390.png`, fullPage: true });
    await readerCard.getByRole('heading', { name: title }).getByRole('link').click();
    await reader!.waitForURL(`**/ilanlar/${postingId}`);
    await expect(reader!.getByText('Paylaşan')).toBeVisible();
    await expect(reader!.getByText(/kabul garantisi yoktur/)).toBeVisible();
    const apply = reader!.getByRole('link', { name: /Başvur/ });
    await expect(apply).toHaveAttribute('href', source);
    await expect(apply).toHaveAttribute('rel', 'noopener noreferrer');
    expect(await reader!.content()).not.toContain(sharer.id);
    if (shots) await reader!.screenshot({ path: `${shots}/okuyucu-detay-390.png`, fullPage: true });
    // 1440 px öz-kontrol: kart ve ayrıntı yatay taşmaz.
    await reader!.setViewportSize({ width: 1440, height: 900 });
    await expect(reader!.getByText('Bir öğrenci paylaştı')).toBeVisible();
    expect(await reader!.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (shots)
      await reader!.screenshot({ path: `${shots}/okuyucu-detay-1440.png`, fullPage: true });
    await reader!.goto('/ilanlar');
    await reader!.getByLabel('Pozisyon veya kurum ara').fill(title);
    await reader!.getByRole('button', { name: 'Ara', exact: true }).click();
    await expect(
      reader!.locator('article').filter({ hasText: title }).getByText('Bir öğrenci paylaştı'),
    ).toBeVisible();
    if (shots) await reader!.screenshot({ path: `${shots}/okuyucu-kart-1440.png`, fullPage: true });
    // 1440 px: tam açıklama ve "İlan paylaş" görünür, yatay taşma yok.
    await student!.setViewportSize({ width: 1440, height: 900 });
    await student!.goto('/ilanlar');
    await expect(student!.getByText(/sen de paylaşabilirsin/)).toBeVisible();
    await expect(student!.getByText('Topluluğun paylaştığı, bölüm onaylı ilanlar.')).toBeHidden();
    await expect(student!.getByRole('link', { name: 'İlan paylaş' }).first()).toBeVisible();
    expect(await student!.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (shots)
      await student!.screenshot({ path: `${shots}/ogrenci-ilanlar-1440.png`, fullPage: true });
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    postingId ??= (await db.jobPosting.findFirst({ where: { title }, select: { id: true } }))?.id;
    if (postingId) {
      await db.pointEntry.deleteMany({ where: { sourceType: 'JOB_POSTING', sourceId: postingId } });
      await db.jobPosting.deleteMany({ where: { id: postingId } });
    }
    await db.inAppNotification.deleteMany({
      where: { userId: sharer.id, id: { notIn: initialNotes.map((n) => n.id) } },
    });
    await db.notificationIntent.deleteMany({
      where: { userId: sharer.id, id: { notIn: initialIntents.map((i) => i.id) } },
    });
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

test('ilan adımları klavyeyle doğrulanır, başlık duyurulur ve geri dönünce veri korunur', async ({
  page,
  browserName,
}) => {
  const { addDays, istanbulDay } = await import('../../src/components/job-postings/model');
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'alumniMentor');
  await page.goto('/ilanlar/yeni');
  await waitForHydratedControl(page, 'Devam et');
  const tabTo = async (target: import('@playwright/test').Locator) => {
    for (let i = 0; i < 45; i++) {
      if (await target.evaluate((element) => element === document.activeElement)) return;
      await tabForward(page);
    }
    throw new Error('Klavye hedefe ulaşamadı');
  };
  const next = page.getByRole('button', { name: 'Devam et' });
  await tabTo(next);
  await page.keyboard.press('Enter');
  const title = page.getByLabel('Pozisyon adı', { exact: false });
  await expect(title).toBeFocused();
  const focusedBox = await title.boundingBox();
  const stickyButton = await next.boundingBox();
  expect(focusedBox).not.toBeNull();
  expect(stickyButton).not.toBeNull();
  expect(focusedBox!.y + focusedBox!.height).toBeLessThan(stickyButton!.y);
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  const described = await title.getAttribute('aria-describedby');
  expect(described).toBeTruthy();
  await expect(page.locator(`[id="${described}"]`)).toContainText('Bu alanı kontrol et.');
  await page.keyboard.type('Yazılım stajyeri');
  const organization = page.getByLabel('Kurum adı', { exact: false });
  await tabTo(organization);
  await page.keyboard.type('Örnek Kurum');
  await title.fill('İ'.repeat(121));
  await next.click();
  await expect(title).toHaveValue('İ'.repeat(121));
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(title).toHaveAccessibleDescription('En fazla 120 karakter gir.');
  await title.fill('Yazılım stajyeri');
  await tabTo(next);
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { name: /Ayrıntılar ve başvuru$/ });
  await expect(heading).toBeFocused();
  await expect(page.getByText('Adım 2 / 3: Ayrıntılar ve başvuru', { exact: true })).toBeVisible();
  await expect(heading).toHaveAccessibleName('Adım 2 / 3: Ayrıntılar ve başvuru');
  const description = page.getByLabel('Açıklama', { exact: false });
  await tabTo(next);
  await page.keyboard.press('Enter');
  await expect(description).toBeFocused();
  await expect(description).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.type(
    'Öğrenciler için gerçek projelerde öğrenme fırsatı sunan örnek bir staj.',
  );
  const location = page.getByLabel('Konum', { exact: false });
  await tabTo(location);
  await page.keyboard.type('İstanbul');
  const deadline = page.getByLabel('Son başvuru tarihi', { exact: false });
  await tabTo(deadline);
  await expect(deadline).toBeFocused();
  const expectedDay = addDays(istanbulDay(), 14);
  // Safari'nin yerel tarih bölümleri MMDDYYYY tuş dizisini kabul etmiyor (kanal probunda değer boş kaldı).
  // Alan yine gerçek klavye dolaşımıyla bulunur; yerel değer girişi motorun tarih kanalından yapılır.
  if (browserName === 'webkit') await deadline.fill(expectedDay);
  else {
    const [year, month, day] = expectedDay.split('-');
    await page.keyboard.type(`${month}${day}${year}`);
  }
  await expect(deadline).toHaveValue(expectedDay);
  const department = page.getByRole('checkbox', { name: /Yönetim Bilişim Sistemleri/ }).first();
  await tabTo(department);
  await page.keyboard.press('Space');
  const url = page.getByLabel('HTTPS başvuru bağlantısı', { exact: false });
  await tabTo(url);
  await page.keyboard.type('https://example.org/staj');
  await tabTo(next);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /İlan önizlemesi$/ })).toBeFocused();
  const previous = page.getByRole('button', { name: 'Geri' });
  await tabTo(previous);
  await page.keyboard.press('Enter');
  await expect(heading).toBeFocused();
  await expect(description).toHaveValue(
    'Öğrenciler için gerçek projelerde öğrenme fırsatı sunan örnek bir staj.',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_PERSONAS } from '../../prisma/seed-data';
import { expect, test, type Page } from './fixture';
import { loginAs } from './login';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
test.afterAll(() => db.$disconnect());

// 360 px mobil tur (kart 536): ürünün en küçük hedefi 360 px'tir (docs/design.md "Mobil öncelik"). Gece değişen listelerde, kuyruklarda ve
// KVKK ekranlarında; açık + koyu temada; 360 ve 390 genişlikte: yatay taşma yok, alt gezinme etiketleri tek satır, dokunma hedefi ≥ 44 px,
// dosya seçicide yer tutucu kesilmiyor. Ölçüm tarayıcıdadır (jsdom yerleşim bilmez); bulgu çıkarsa sayfa düzeltilir, test gevşetilmez.
const SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

const STUDENT = [
  '/ilanlar',
  '/ilanlar?page=2',
  '/mezunlar',
  '/mezunlar?page=2',
  '/sirketler',
  '/mentorlar',
  '/deneyimler',
  '/basvuru-takvimi',
  '/hesap/veriler',
  '/hesap',
];
const ADMIN = [
  '/yonetim/ilanlar',
  '/yonetim/sikayetler',
  '/yonetim/deneyimler',
  '/yonetim/puan',
  '/yonetim/ayin-mezunu',
  '/yonetim/eslesmeyenler',
  '/yonetim/davetler',
];

// Uzun kurum/konum adlı iki yayımlı ilan (biri şirket bağlantılı): liste kartında kurum adı en çok 2 satır, konum rozeti üç noktayla kısalır.
const LONG_ORG = 'Türkiye Cumhuriyeti Kalkınma ve Yatırım Bankası Genel Müdürlüğü Ankara Teşkilatı';
const LONG_LOCATION = 'Kahramanmaraş Onikişubat Merkez Mahallesi Uzun Cadde Sokak Apartman Dairesi';
const LONG_TITLE = 'Uzun adlı 360 ilanı';
async function seedLongPostings() {
  if (await db.jobPosting.count({ where: { title: { startsWith: LONG_TITLE } } })) return;
  const [student, mentor, admin, company] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { email: TEST_PERSONAS.student.email },
      include: { memberships: true },
    }),
    db.user.findUniqueOrThrow({ where: { email: TEST_PERSONAS.alumniMentor.email } }),
    db.user.findUniqueOrThrow({ where: { email: TEST_PERSONAS.systemAdmin.email } }),
    db.company.findFirstOrThrow(),
  ]);
  const departmentId = student.memberships[0]!.departmentId;
  const now = new Date();
  const deadlineOn = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30),
  );
  const created = await db.jobPosting.createManyAndReturn({
    data: [null, company.id].map((companyId, index) => ({
      authorId: mentor.id,
      departmentIdAtWrite: departmentId,
      kind: 'INTERNSHIP' as const,
      title: `${LONG_TITLE} ${index + 1}: Kurumsal Kaynak Planlama ve Müşteri İlişkileri Yönetimi Yaz Stajyeri`,
      organizationName: LONG_ORG,
      companyId,
      location: LONG_LOCATION,
      isRemote: false,
      description:
        'Uzun ad davranışını 360 piksel genişlikte ölçmek için üretilmiş açıklama metni, otuz karakterden uzundur.',
      applyMethod: 'URL' as const,
      applyUrl: 'https://example.com/uzun-ilan',
      deadlineOn,
      targetGrades: [] as number[],
      status: 'PUBLISHED' as const,
      submittedAt: now,
      moderatedById: admin.id,
      moderatedAt: now,
      publishedAt: new Date(now.getTime() + index * 1000),
    })),
    select: { id: true },
  });
  await db.jobPostingDepartment.createMany({
    data: created.map((posting) => ({ postingId: posting.id, departmentId })),
  });
}

type Report = {
  overflow: number;
  navLabels: { text: string; lines: number; clipped: boolean }[];
  smallControls: string[];
  pickerStatusClipped: boolean;
};

async function measure(page: Page): Promise<Report> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        Number(style.opacity) > 0 &&
        box.width > 2 &&
        box.height > 2 &&
        !element.closest('[hidden], [inert], .sr-only') &&
        !(element.closest('details:not([open])') && !element.closest('summary'))
      );
    };
    const navLabels = [...document.querySelectorAll('[data-bottom-nav] li')].map((item) => {
      const label = item.querySelector('a,button')!.querySelector('span:last-child')!;
      const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
      return {
        text: label.textContent ?? '',
        lines: Math.round(label.getBoundingClientRect().height / lineHeight),
        clipped: label.scrollWidth > label.clientWidth + 1,
      };
    });
    const smallControls: string[] = [];
    const selector =
      'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio]';
    for (const element of document.querySelectorAll(selector)) {
      const target = element.matches('input[type=checkbox],input[type=radio]')
        ? (element.closest('label') ?? element)
        : element;
      if (!visible(target)) continue;
      // Cümle içindeki metin bağlantısı dokunma hedefi sayılmaz (yalnız bağımsız denetimler ölçülür).
      const inline =
        element.tagName === 'A' &&
        getComputedStyle(element).display === 'inline' &&
        (element.parentElement?.textContent ?? '').trim().length >
          (element.textContent ?? '').trim().length + 8;
      if (inline) continue;
      const box = target.getBoundingClientRect();
      if (Math.min(box.width, box.height) < 43.5)
        smallControls.push(
          `${element.tagName.toLowerCase()}[${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 30)}] ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
    }
    const picker = document.querySelector('[id][class*="min-w-0"][class*="flex-1"]');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      navLabels,
      smallControls,
      pickerStatusClipped: picker
        ? picker.scrollWidth > picker.clientWidth + 1 &&
          picker.textContent === 'Henüz dosya seçilmedi'
        : false,
    };
  });
}

/** /ilanlar: uzun kurum adı en çok 2 satır, konum rozeti kart içinde kalır ve üç nokta çizer. */
async function auditLongPostings(page: Page, where: string) {
  const cards = page.locator('article').filter({ hasText: LONG_TITLE });
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    const result = await card.evaluate(
      (element, [org, location]) => {
        const cardBox = element.getBoundingClientRect();
        const text = element.querySelector(`p[title="${org}"] .line-clamp-2`)!;
        const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
        const chip = element.querySelector(`[title="${location}"]`)!;
        const chipText = chip.firstElementChild!;
        return {
          orgLines: Math.round(text.getBoundingClientRect().height / lineHeight),
          orgClamp: getComputedStyle(text).getPropertyValue('-webkit-line-clamp'),
          chipInside: chip.getBoundingClientRect().right <= cardBox.right + 1,
          chipEllipsis: getComputedStyle(chipText).textOverflow === 'ellipsis',
          chipTruncated: chipText.scrollWidth > chipText.clientWidth,
        };
      },
      [LONG_ORG, LONG_LOCATION],
    );
    expect
      .soft(result.orgLines, `/ilanlar (${where}): kurum adı en çok 2 satır`)
      .toBeLessThanOrEqual(2);
    expect.soft(result.orgClamp, `/ilanlar (${where}): kurum adı line-clamp`).toBe('2');
    expect.soft(result.chipInside, `/ilanlar (${where}): konum rozeti kart içinde`).toBe(true);
    expect.soft(result.chipEllipsis, `/ilanlar (${where}): konum üç nokta`).toBe(true);
    expect.soft(result.chipTruncated, `/ilanlar (${where}): uzun konum kısalıyor`).toBe(true);
  }
}

async function audit(page: Page, path: string, where: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  if (path === '/ilanlar') await auditLongPostings(page, where);
  if (path === '/yonetim/ayin-mezunu') {
    await page.locator('main select').first().selectOption({ index: 0 });
    await page.getByRole('button', { name: 'Hikâyeleri göster' }).click();
    await page.waitForLoadState('networkidle');
  }
  const report = await measure(page);
  const label = `${path} (${where})`;
  expect.soft(report.overflow, `${label}: yatay taşma`).toBeLessThanOrEqual(0);
  expect.soft(report.navLabels, `${label}: alt gezinme sekmeleri`).toHaveLength(5);
  for (const item of report.navLabels) {
    expect.soft(item.lines, `${label}: "${item.text}" tek satır`).toBe(1);
    expect.soft(item.clipped, `${label}: "${item.text}" kesilmiyor`).toBe(false);
  }
  expect.soft(report.smallControls, `${label}: 44 px altı dokunma hedefi`).toEqual([]);
  expect.soft(report.pickerStatusClipped, `${label}: dosya seçici yer tutucusu`).toBe(false);
}

for (const scheme of SCHEMES) {
  for (const size of SIZES) {
    test.describe(`${scheme} tema, ${size.width}px`, () => {
      test.use({ colorScheme: scheme, viewport: size });
      const where = `${scheme}, ${size.width}px`;

      test('öğrenci ekranları', async ({ page }) => {
        test.setTimeout(240_000);
        await seedLongPostings();
        await loginAs(page, 'student');
        for (const path of STUDENT) await audit(page, path, where);
      });

      test('yönetim kuyrukları', async ({ page }) => {
        test.setTimeout(240_000);
        await loginAs(page, 'systemAdmin');
        for (const path of ADMIN) await audit(page, path, where);
      });
    });
  }
}

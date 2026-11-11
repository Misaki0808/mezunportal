import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createInstitution, createUser, type Institution } from '@/test/fixtures';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

const at = new Date('2030-06-20T12:00:00Z');
let inst: Institution;
let author: string;
let moderator: string;
beforeAll(async () => {
  inst = await createInstitution(db);
  author = await createUser(db);
  moderator = await createUser(db);
});

const content = {
  kind: 'INTERNSHIP' as const,
  title: 'Veri analisti stajyeri',
  organizationName: 'Örnek Teknoloji',
  location: 'İstanbul',
  description: 'Veri analizi ve raporlama işlerinde destek verecek bir stajyer arıyoruz.',
  applyMethod: 'URL' as const,
  applyUrl: 'https://kariyer.example.com/ilan/1',
  deadlineOn: new Date('2030-07-15'),
};
const base = () => ({ authorId: author, departmentIdAtWrite: inst.deptA1 });
const draft = (over: object = {}) => db.jobPosting.create({ data: { ...base(), ...over } });
const pending = (over: object = {}) =>
  db.jobPosting.create({
    data: { ...base(), ...content, status: 'PENDING', submittedAt: at, ...over },
  });
const published = (over: object = {}) =>
  db.jobPosting.create({
    data: {
      ...base(),
      ...content,
      status: 'PUBLISHED',
      submittedAt: at,
      moderatedById: moderator,
      moderatedAt: at,
      publishedAt: at,
      ...over,
    },
  });

describe('ilan tablosu değişmezleri', () => {
  it('geçerli durumlar yazılır (taslak boş olabilir; uzaktan ilan konumsuz; iletişim talebi bağlantısız)', async () => {
    await expect(draft()).resolves.toBeTruthy();
    await expect(draft({ title: 'ab', applyMethod: 'URL' })).rejects.toThrow(); // başlık sınırı taslakta da
    await expect(pending()).resolves.toBeTruthy();
    await expect(pending({ location: null, isRemote: true })).resolves.toBeTruthy();
    await expect(pending({ applyMethod: 'CONTACT_REQUEST', applyUrl: null })).resolves.toBeTruthy();
    await expect(published()).resolves.toBeTruthy();
    await expect(
      db.jobPosting.create({
        data: {
          ...base(),
          ...content,
          status: 'REJECTED',
          submittedAt: at,
          moderatedById: moderator,
          moderatedAt: at,
          moderationNote: 'Bağlantı çalışmıyor',
        },
      }),
    ).resolves.toBeTruthy();
    // PENDING iken süresi dolan ilan yayına hiç girmemiştir
    await expect(pending({ status: 'EXPIRED', endedAt: at })).resolves.toBeTruthy();
    // yayınlanmış ilanı yazar çeker / moderatör kaldırır / süre dolar
    await expect(
      published({ status: 'CLOSED', endedAt: at, endedById: moderator }),
    ).resolves.toBeTruthy();
    await expect(published({ status: 'EXPIRED', endedAt: at })).resolves.toBeTruthy();
  });

  it.each([
    ['başlık çok kısa', { title: 'ab' }],
    ['başlık çok uzun', { title: 'a'.repeat(121) }],
    ['kurum çok kısa', { organizationName: 'a' }],
    ['açıklama çok kısa', { description: 'kısa' }],
    ['açıklama çok uzun', { description: 'a'.repeat(3001) }],
    ['konum çok kısa', { location: 'a' }],
    ['bağlantı çok uzun', { applyUrl: `https://example.com/${'a'.repeat(500)}` }],
  ])('metin sınırı: %s', async (_name, patch) => {
    await expect(draft(patch)).rejects.toThrow();
  });

  it.each([
    ['http bağlantı', { applyMethod: 'URL', applyUrl: 'http://example.com/x' }],
    ['javascript bağlantı', { applyMethod: 'URL', applyUrl: 'javascript:alert(1)' }],
    [
      'iletişim talebinde bağlantı',
      { applyMethod: 'CONTACT_REQUEST', applyUrl: 'https://example.com/x' },
    ],
    ['yöntemsiz bağlantı', { applyMethod: null, applyUrl: 'https://example.com/x' }],
  ])('başvuru yolu: %s', async (_name, patch) => {
    await expect(draft(patch)).rejects.toThrow();
  });

  it.each([
    ['başlık yok', { title: null }],
    ['kurum yok', { organizationName: null }],
    ['açıklama yok', { description: null }],
    ['konum de uzaktan da yok', { location: null, isRemote: false }],
    ['başvuru yöntemi yok', { applyMethod: null, applyUrl: null }],
    ['URL yöntemi bağlantısız', { applyUrl: null }],
    ['son tarih yok', { deadlineOn: null }],
  ])('DRAFT dışı tam olmalı: %s', async (_name, patch) => {
    await expect(pending(patch)).rejects.toThrow();
  });

  it.each([
    ['DRAFT gönderilmiş', () => draft({ submittedAt: at })],
    ['DRAFT kararlı', () => draft({ moderatedById: moderator, moderatedAt: at })],
    ['PENDING gönderimsiz', () => pending({ submittedAt: null })],
    ['PENDING yayınlanmış', () => pending({ publishedAt: at })],
    ['PENDING karar izli', () => pending({ moderatedById: moderator, moderatedAt: at })],
    ['PUBLISHED yayın anı yok', () => published({ publishedAt: null })],
    ['PUBLISHED moderatörsüz', () => published({ moderatedById: null })],
    ['PUBLISHED notlu', () => published({ moderationNote: 'neden' })],
    ['PUBLISHED bitmiş', () => published({ endedAt: at })],
    [
      'REJECTED notsuz',
      () =>
        db.jobPosting.create({
          data: {
            ...base(),
            ...content,
            status: 'REJECTED',
            submittedAt: at,
            moderatedById: moderator,
            moderatedAt: at,
          },
        }),
    ],
    [
      'REJECTED kısa not',
      () =>
        db.jobPosting.create({
          data: {
            ...base(),
            ...content,
            status: 'REJECTED',
            submittedAt: at,
            moderatedById: moderator,
            moderatedAt: at,
            moderationNote: 'ab',
          },
        }),
    ],
    ['EXPIRED bitiş anı yok', () => pending({ status: 'EXPIRED' })],
    [
      'EXPIRED kaldıran moderatörlü',
      () => pending({ status: 'EXPIRED', endedAt: at, endedById: moderator }),
    ],
    ['CLOSED bitiş anı yok', () => published({ status: 'CLOSED' })],
    [
      'bitmiş yayın izi yarım',
      () => published({ status: 'CLOSED', endedAt: at, moderatedById: null }),
    ],
    ['bitmiş gönderimsiz', () => pending({ status: 'CLOSED', endedAt: at, submittedAt: null })],
  ])('durum tutarlılığı: %s', async (_name, make) => {
    await expect(make()).rejects.toThrow();
  });

  it('son başvuru tarihi yayın gününden (İstanbul) en çok 60 gün sonra: gün sınırı İstanbul saatine göredir', async () => {
    // 2030-06-30T21:30Z = İstanbul 2030-07-01 00:30 → yayın günü 1 Temmuz; +60 gün = 30 Ağustos
    const edge = new Date('2030-06-30T21:30:00Z');
    await expect(
      published({ publishedAt: edge, moderatedAt: edge, deadlineOn: new Date('2030-08-30') }),
    ).resolves.toBeTruthy();
    await expect(
      published({ publishedAt: edge, moderatedAt: edge, deadlineOn: new Date('2030-08-31') }),
    ).rejects.toThrow();
    // UTC'de aynı gün olan 20:30Z (İstanbul 23:30, 30 Haziran): +60 = 29 Ağustos
    const before = new Date('2030-06-30T20:30:00Z');
    await expect(
      published({ publishedAt: before, moderatedAt: before, deadlineOn: new Date('2030-08-29') }),
    ).resolves.toBeTruthy();
    await expect(
      published({ publishedAt: before, moderatedAt: before, deadlineOn: new Date('2030-08-30') }),
    ).rejects.toThrow();
  });

  it('hedef bölüm bağlantısı ilanla silinir; aynı bölüm iki kez eklenemez; bölüm silinemez', async () => {
    const posting = await pending();
    await db.jobPostingDepartment.create({
      data: { postingId: posting.id, departmentId: inst.deptA1 },
    });
    await expect(
      db.jobPostingDepartment.create({
        data: { postingId: posting.id, departmentId: inst.deptA1 },
      }),
    ).rejects.toThrow();
    await expect(db.department.delete({ where: { id: inst.deptA1 } })).rejects.toThrow();
    await db.jobPosting.delete({ where: { id: posting.id } });
    expect(await db.jobPostingDepartment.count({ where: { postingId: posting.id } })).toBe(0);
  });

  it('şikâyet: açık şikâyet karar taşımaz, kapalı şikâyet karar taşır; kullanıcı/ilan başına tek AÇIK şikâyet; ilanla silinir', async () => {
    const posting = await published();
    const reporter = await createUser(db);
    const open = await db.jobPostingReport.create({
      data: { postingId: posting.id, reporterId: reporter, reason: 'Sahte ilan görünüyor' },
    });
    await expect(
      db.jobPostingReport.create({
        data: { postingId: posting.id, reporterId: reporter, reason: 'Yine sahte' },
      }),
    ).rejects.toThrow();
    await expect(
      db.jobPostingReport.create({
        data: { postingId: posting.id, reporterId: await createUser(db), reason: 'Ben de buldum' },
      }),
    ).resolves.toBeTruthy();
    await expect(
      db.jobPostingReport.update({
        where: { id: open.id },
        data: { status: 'RESOLVED' }, // karar alanları eksik
      }),
    ).rejects.toThrow();
    await db.jobPostingReport.update({
      where: { id: open.id },
      data: {
        status: 'DISMISSED',
        reviewedAt: at,
        reviewedById: moderator,
        resolutionNote: 'Uygun',
      },
    });
    // kapalı geçmiş yeni şikâyeti engellemez
    await expect(
      db.jobPostingReport.create({
        data: { postingId: posting.id, reporterId: reporter, reason: 'Hâlâ sorunlu' },
      }),
    ).resolves.toBeTruthy();
    await expect(
      db.jobPostingReport.create({
        data: { postingId: posting.id, reporterId: await createUser(db), reason: 'ab' },
      }),
    ).rejects.toThrow();
    await db.jobPosting.delete({ where: { id: posting.id } });
    expect(await db.jobPostingReport.count({ where: { postingId: posting.id } })).toBe(0);
  });
});

describe('üretilmiş arama sütunları', () => {
  it('searchVector/searchKeys yazılamaz, başlık/kurum/konum/açıklama sorgulanır, Türkçe ve ASCII katlama çalışır', async () => {
    const row = await published({
      title: 'Yönetim Bilişim Sistemleri Stajyeri',
      organizationName: 'Çağdaş Yazılım',
      location: 'Şişli',
      description:
        'Müşteri ilişkileri yönetimi ve veri ambarı projelerinde görev alacak öğrenci aranıyor.',
    });
    await expect(
      db.$executeRaw`UPDATE "JobPosting" SET "searchKeys" = 'x' WHERE "id" = ${row.id}`,
    ).rejects.toThrow();
    const hit = async (query: string) =>
      (
        await db.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "JobPosting" WHERE "id" = ${row.id}
            AND ("searchVector" @@ plainto_tsquery('turkish', tr_lower(${query}))
              OR "searchVector" @@ plainto_tsquery('simple', tr_ascii(${query})))`
      ).length;
    expect(await hit('stajyer')).toBe(1); // başlık (gövdeleme: Stajyeri)
    expect(await hit('cagdas')).toBe(1); // kurum, ASCII katlama
    expect(await hit('sisli')).toBe(1); // konum
    expect(await hit('kuyumcu')).toBe(0);
    expect(await hit('ambari')).toBe(1); // ASCII katlama: ambarı
    expect(await hit('ambarı')).toBe(1); // açıklama
    const similar = await db.$queryRaw<{ s: number }[]>`
      SELECT similarity("searchKeys", tr_ascii('Yonetim Bilisim Sistemleri')) AS s FROM "JobPosting" WHERE "id" = ${row.id}`;
    expect(similar[0]!.s).toBeGreaterThan(0.3);
  });

  it('PRISMA_OMIT: searchKeys varsayılan yanıtta yoktur', async () => {
    const row = await published();
    const found = await db.jobPosting.findUniqueOrThrow({ where: { id: row.id } });
    expect(found).not.toHaveProperty('searchKeys');
  });

  it('PRISMA_OMIT: User.nameSearch (ad türevi) varsayılan yanıtta yoktur', async () => {
    const author = await createUser(db);
    expect(await db.user.findUniqueOrThrow({ where: { id: author } })).not.toHaveProperty(
      'nameSearch',
    );
  });
});

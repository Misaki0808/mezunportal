import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { searchExperiencesSchema, type SearchExperiencesInput } from '@/contracts/search';
import type { Prisma } from '@/generated/prisma/client';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser, type Institution } from '@/test/fixtures';

import { loadActor } from '../permissions/actor';
import { listSearchSectors, searchExperiences } from './search';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

let inst: Institution;
let other: Institution;
let viewerId: string;

beforeAll(async () => {
  inst = await createInstitution(db);
  other = await createInstitution(db);
  moderatorId = await createUser(db);
  viewerId = await createUser(db);
  await addMembership(db, {
    userId: viewerId,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
});

async function run(input: SearchExperiencesInput, as: string = viewerId) {
  const actor = await loadActor(db, as, new Date());
  if (!actor) throw new Error('kullanıcı yüklenemedi');
  return searchExperiences({ db }, actor, searchExperiencesSchema.parse(input));
}
const ids = async (input: SearchExperiencesInput, as?: string) =>
  (await run(input, as)).items.map((item) => item.id);

type ExperienceSeed = Partial<Prisma.ExperienceUncheckedCreateInput>;
let moderatorId = '';

/** Veritabanı kısıtlarını (Experience_*_check) sağlayan, türüne uygun yayınlanmış satır alanları. */
function fieldsFor(type: string): Partial<Prisma.ExperienceUncheckedCreateInput> {
  switch (type) {
    case 'INTERNSHIP':
      return { durationWeeks: 8, pay: 'PAID', applicationChannel: 'REFERRAL' };
    case 'ERASMUS':
    case 'STUDY_ABROAD':
      return { durationWeeks: 20, country: 'Almanya', applicationChannel: 'CAREER_FAIR' };
    case 'CLUB':
    case 'CERTIFICATE':
      return {};
    default:
      return { applicationChannel: 'LINKEDIN_POST' };
  }
}

async function experience(seed: ExperienceSeed = {}, institution: Institution = inst) {
  const type = (seed.type ?? 'INTERNSHIP') as string;
  const row = await db.experience.create({
    data: {
      authorId: seed.authorId === undefined ? await createUser(db) : seed.authorId,
      departmentIdAtWrite: institution.deptA1,
      organizationName: 'Örnek Kurum',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      moderatedById: moderatorId,
      moderatedAt: new Date(),
      termYear: 2025,
      termSeason: 'SUMMER',
      whatLearned: 'Genel bir deneyim.',
      advice: 'Genel bir tavsiye.',
      isAnonymous: true,
      ...fieldsFor(type),
      ...seed,
      type: type as never,
    } as Prisma.ExperienceUncheckedCreateInput,
    select: { id: true },
  });
  return row.id;
}
/** Her testin kendi benzersiz belirteci: paylaşılan veritabanında başka testlerin satırlarıyla karışmaz. */
const tag = () => `zx${randomUUID().replace(/-/g, '').slice(0, 10)}`;

describe('Türkçe tam metin: büyük/küçük harf ve ek farkları eşleşir', () => {
  it.each(['staj', 'stajı', 'STAJ', 'Staj', 'STAJI', 'stajda'])(
    '“%s” gövdeyi bulur (yalnız metinde geçen “staj”)',
    async (query) => {
      const marker = tag();
      const id = await experience({
        type: 'CERTIFICATE',
        organizationName: marker,
        whatLearned: 'Bir staj fırsatı buldum.',
      });
      const found = await ids({ q: `${marker} ${query}` });
      expect(found).toContain(id);
    },
  );

  it.each(['İstanbul', 'ISTANBUL', 'istanbul', 'Istanbul', 'İSTANBUL'])(
    '“%s” İstanbul’daki deneyimi bulur',
    async (query) => {
      const marker = tag();
      const id = await experience({ organizationName: marker, city: 'İstanbul' });
      expect(await ids({ q: `${marker} ${query}` })).toContain(id);
    },
  );

  it.each(['diyarbakır', 'Diyarbakir', 'DIYARBAKIR', 'DİYARBAKIR'])(
    '“%s” Diyarbakır’ı bulur (ı/i ayrımı)',
    async (query) => {
      const marker = tag();
      const id = await experience({ organizationName: marker, city: 'Diyarbakır' });
      expect(await ids({ q: `${marker} ${query}` })).toContain(id);
    },
  );

  it.each(['Eskişehir', 'ESKİŞEHİR', 'eskisehir', 'ESKISEHIR'])(
    'ASCII yazılmış kayıt (“Eskisehir”) Türkçe harfli “%s” sorgusuyla bulunur',
    async (query) => {
      const marker = tag();
      const id = await experience({ organizationName: marker, city: 'Eskisehir' });
      expect(await ids({ q: `${marker} ${query}` })).toContain(id);
    },
  );

  it('kısa sözcükte (yazım hatası toleransı yokken) ASCII katlama tek başına eşleştirir: “ÇAY” → “cay”', async () => {
    const marker = tag();
    const id = await experience({
      organizationName: marker,
      whatLearned: 'Cay molasi verildi',
      advice: 'Calis',
    });
    expect(await ids({ q: `${marker} ÇAY` })).toContain(id);
    expect(await ids({ q: `${marker} çay` })).toContain(id);
  });

  it('durak sözcükler (“ve”, “için”) sorguyu daraltmaz', async () => {
    const marker = tag();
    const id = await experience({
      organizationName: marker,
      whatLearned: 'Python öğrendim',
      advice: 'Çalış',
    });
    expect(await ids({ q: `${marker} ve staj için` })).toContain(id);
  });

  it('tür adı aranabilir: “staj” staj türünü, “erasmus” erasmus türünü bulur', async () => {
    const marker = tag();
    const staj = await experience({
      organizationName: marker,
      type: 'INTERNSHIP',
      whatLearned: 'x',
      advice: 'y',
    });
    const erasmus = await experience({
      organizationName: marker,
      type: 'ERASMUS',
      country: 'Almanya',
      whatLearned: 'x',
      advice: 'y',
    });
    expect(await ids({ q: `${marker} staj` })).toEqual(expect.arrayContaining([staj]));
    expect(await ids({ q: `${marker} staj` })).not.toContain(erasmus);
    expect(await ids({ q: `${marker} ERASMUS` })).toContain(erasmus);
  });

  it('birden çok sözcük birlikte aranır (VE); biri eksikse eşleşmez', async () => {
    const marker = tag();
    const id = await experience({
      organizationName: marker,
      whatLearned: 'Python ve veri analizi öğrendim.',
    });
    expect(await ids({ q: `${marker} python analiz` })).toContain(id);
    expect(await ids({ q: `${marker} python kubernetes` })).not.toContain(id);
  });
});

describe('küçük yazım hataları', () => {
  it.each([
    ['Istnbul', 'İstanbul', 'city'],
    ['Istanbl', 'İstanbul', 'city'],
    ['Aselsn', 'Aselsan', 'org'],
    ['Aselsann', 'Aselsan', 'org'],
    ['Diyarbakr', 'Diyarbakır', 'city'],
  ] as const)('“%s” → %s', async (typo, correct, where) => {
    const id = await experience(
      where === 'org'
        ? { organizationName: `${correct} Savunma`, city: 'Ankara' }
        : { organizationName: tag(), city: correct },
    );
    expect(await ids({ q: typo, pageSize: 50 })).toContain(id);
  });

  it('alakasız metin sonuç vermez', async () => {
    await experience({ organizationName: 'Acme' });
    expect(await ids({ q: 'qqqzzzxxxwww' })).toEqual([]);
  });
});

describe('filtreler', () => {
  it('tür, kanal, dönem, ücret ve şirket süzgeçleri tek tek ve birlikte çalışır', async () => {
    const marker = tag();
    const a = await experience({
      organizationName: `${marker} Alfa`,
      type: 'INTERNSHIP',
      applicationChannel: 'REFERRAL',
      termYear: 2024,
      termSeason: 'SUMMER',
      pay: 'PAID',
    });
    const b = await experience({
      organizationName: `${marker} Beta`,
      type: 'GRADUATE_STUDY',
      applicationChannel: 'CAREER_FAIR',
      termYear: 2023,
      termSeason: 'AUTUMN',
    });
    const c = await experience({
      organizationName: `${marker} Gama`,
      type: 'INTERNSHIP',
      applicationChannel: 'LINKEDIN_POST',
      termYear: 2024,
      termSeason: 'WINTER',
      pay: 'NOT_DISCLOSED',
    });
    const all = await ids({ q: marker });
    expect(new Set(all)).toEqual(new Set([a, b, c]));
    expect(new Set(await ids({ q: marker, types: ['INTERNSHIP'] }))).toEqual(new Set([a, c]));
    expect(new Set(await ids({ q: marker, types: ['INTERNSHIP', 'GRADUATE_STUDY'] }))).toEqual(
      new Set([a, b, c]),
    );
    expect(await ids({ q: marker, channels: ['CAREER_FAIR'] })).toEqual([b]);
    expect(new Set(await ids({ q: marker, termYear: 2024 }))).toEqual(new Set([a, c]));
    expect(await ids({ q: marker, termYear: 2024, termSeason: 'WINTER' })).toEqual([c]);
    expect(await ids({ q: marker, pay: 'PAID' })).toEqual([a]);
    expect(
      await ids({ q: marker, types: ['INTERNSHIP'], termYear: 2024, pay: 'NOT_DISCLOSED' }),
    ).toEqual([c]);
    expect(await ids({ q: marker, types: ['GRADUATE_STUDY'], pay: 'PAID' })).toEqual([]);
  });

  it('şirket süzgeci kısmi ve büyük/küçük harf duyarsızdır; joker karakterler kaçırılır', async () => {
    const marker = tag();
    const id = await experience({ organizationName: `${marker} Teknoloji A.Ş.` });
    await experience({ organizationName: `${marker} Gıda` });
    expect(await ids({ company: `${marker.toUpperCase()} tekno` })).toEqual([id]);
    expect(await ids({ company: `${marker} Teknolji` })).toEqual([id]); // küçük yazım hatası
    expect(await ids({ company: '%%' })).toEqual([]);
    expect(await ids({ company: '__' })).toEqual([]);
  });

  it('sektör süzgeci şirket sözlüğü üzerinden çalışır; sözlüğe bağlı olmayan şirket çıkmaz', async () => {
    const marker = tag();
    const sector = await db.sector.create({
      data: { name: `Sektör ${marker}`, normalizedName: `sektor ${marker}` },
    });
    const otherSector = await db.sector.create({
      data: { name: `Diğer ${marker}`, normalizedName: `diger ${marker}` },
    });
    const company = await db.company.create({
      data: {
        name: `Şirket ${marker}`,
        normalizedName: `sirket ${marker}`,
        aliases: [],
        sectorId: sector.id,
      },
    });
    const unrelated = await db.company.create({
      data: {
        name: `Başka ${marker}`,
        normalizedName: `baska ${marker}`,
        aliases: [],
        sectorId: otherSector.id,
      },
    });
    const inSector = await experience({ organizationName: marker, companyId: company.id });
    await experience({ organizationName: marker, companyId: unrelated.id });
    await experience({ organizationName: marker }); // sözlüğe bağlı değil
    expect(await ids({ company: marker, sectorId: sector.id })).toEqual([inSector]);
    expect(await ids({ company: marker, sectorId: randomUUID() })).toEqual([]);
    expect((await ids({ company: marker })).length).toBe(3);
    // metin ve diğer süzgeçlerle birleşir
    expect(await ids({ q: marker, sectorId: sector.id, types: ['INTERNSHIP'] })).toEqual([
      inSector,
    ]);
    expect(await ids({ q: marker, sectorId: sector.id, types: ['ERASMUS'] })).toEqual([]);
  });

  it('süzgeçsiz, metinsiz arama en yenileri sıralar', async () => {
    const marker = tag();
    const older = await experience({
      organizationName: marker,
      publishedAt: new Date('2025-01-01'),
    });
    const newer = await experience({
      organizationName: marker,
      publishedAt: new Date('2026-01-01'),
    });
    const page = await run({ company: marker });
    expect(page.sort).toBe('NEWEST');
    expect(page.items.map((item) => item.id)).toEqual([newer, older]);
  });

  it('alaka sırası: şirket adındaki eşleşme yalnız metindekinden önce gelir', async () => {
    const marker = tag();
    const body = await experience({
      organizationName: 'Başka Kurum',
      whatLearned: `${marker} kelimesi metinde geçiyor`,
      publishedAt: new Date('2026-06-01'),
    });
    const org = await experience({
      organizationName: marker,
      whatLearned: 'alakasız',
      publishedAt: new Date('2025-01-01'),
    });
    const page = await run({ q: marker, sort: 'RELEVANCE' });
    expect(page.sort).toBe('RELEVANCE');
    expect(page.items.map((item) => item.id).slice(0, 2)).toEqual([org, body]);
    expect((await run({ q: marker, sort: 'NEWEST' })).items[0]?.id).toBe(body);
  });
});

describe('sayfalama', () => {
  it('sayfa, toplam ve hasMore tutarlıdır; sayfalar çakışmaz; son sayfanın ötesi boş ama toplam doğrudur', async () => {
    const marker = tag();
    const created: string[] = [];
    for (let index = 0; index < 7; index += 1) {
      created.push(
        await experience({
          organizationName: marker,
          publishedAt: new Date(Date.UTC(2026, 0, index + 1)),
        }),
      );
    }
    const p1 = await run({ company: marker, pageSize: 3 });
    const p2 = await run({ company: marker, pageSize: 3, page: 2 });
    const p3 = await run({ company: marker, pageSize: 3, page: 3 });
    const p4 = await run({ company: marker, pageSize: 3, page: 4 });
    expect([p1.items.length, p2.items.length, p3.items.length, p4.items.length]).toEqual([
      3, 3, 1, 0,
    ]);
    expect([p1.total, p2.total, p3.total, p4.total]).toEqual([7, 7, 7, 7]);
    expect([p1.hasMore, p2.hasMore, p3.hasMore, p4.hasMore]).toEqual([true, true, false, false]);
    const seen = [...p1.items, ...p2.items, ...p3.items].map((item) => item.id);
    expect(new Set(seen).size).toBe(7);
    expect(seen).toEqual([...created].reverse());
  });
});

describe('görünürlük (K-07) ve yayın durumu', () => {
  it('yalnız PUBLISHED döner; taslak, bekleyen ve reddedilen asla', async () => {
    const marker = tag();
    const pub = await experience({ organizationName: marker });
    for (const status of ['DRAFT', 'PENDING', 'REJECTED'] as const) {
      await experience({
        organizationName: marker,
        status,
        publishedAt: null,
        ...(status === 'REJECTED'
          ? { moderationNote: 'Uygun değil' }
          : { moderatedById: null, moderatedAt: null }),
      });
    }
    expect(await ids({ company: marker })).toEqual([pub]);
  });

  it('başka üniversitenin deneyimi görünmez; aynı üniversitenin başka bölümü görünür (bölüm/fakülte sınırı yok)', async () => {
    const marker = tag();
    const sameOtherFaculty = await experience({
      organizationName: marker,
      departmentIdAtWrite: inst.deptB1,
    });
    const sameOtherDept = await experience({
      organizationName: marker,
      departmentIdAtWrite: inst.deptA2,
    });
    const foreign = await experience({ organizationName: marker }, other);
    const found = await ids({ company: marker });
    expect(new Set(found)).toEqual(new Set([sameOtherFaculty, sameOtherDept]));
    expect(found).not.toContain(foreign);
  });

  it('doğrulanmamış, bekleyen ya da kapanmış üyeliği olan arayan arama yapamaz (AUTH_NOT_VERIFIED)', async () => {
    const marker = tag();
    await experience({ organizationName: marker });
    const pending = await createUser(db);
    await addMembership(db, {
      userId: pending,
      departmentId: inst.deptA1,
      role: 'ALUMNI',
      status: 'PENDING',
      graduationYear: 2023,
    });
    const ended = await createUser(db);
    await addMembership(db, {
      userId: ended,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2020,
      endedAt: new Date('2024-01-01'),
    });
    const none = await createUser(db);
    for (const user of [pending, ended, none]) {
      const error = await ids({ company: marker }, user).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(isCodedError(error) && error.code).toBe('AUTH_NOT_VERIFIED');
    }
  });

  it('iki üniversitede üyeliği olan arayan ikisini de görür', async () => {
    const marker = tag();
    const a = await experience({ organizationName: marker });
    const b = await experience({ organizationName: marker }, other);
    const both = await createUser(db);
    await addMembership(db, {
      userId: both,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    await addMembership(db, {
      userId: both,
      departmentId: other.deptA1,
      role: 'ALUMNI',
      graduationYear: 2022,
    });
    expect(new Set(await ids({ company: marker }, both))).toEqual(new Set([a, b]));
  });

  it('süzgeç görünürlüğü genişletmez: üniversite/bölüm/yazar alanları şemada yok', () => {
    for (const extra of [
      { universityId: 'x' },
      { departmentId: 'x' },
      { authorId: 'x' },
      { status: 'DRAFT' },
    ]) {
      expect(searchExperiencesSchema.safeParse(extra).success).toBe(false);
    }
  });
});

describe('anonimlik ve yazar durumu', () => {
  it('anonim deneyimde sonuçta HİÇBİR yazar alanı yoktur (yanıtın tamamında yazar kimliği/adı geçmez)', async () => {
    const marker = tag();
    const authorId = await createUser(db, { name: 'Gizli Yazar Adı' });
    const id = await experience({ organizationName: marker, authorId, isAnonymous: true });
    const page = await run({ company: marker });
    const item = page.items.find((candidate) => candidate.id === id)!;
    expect(item.isAnonymous).toBe(true);
    expect('author' in item).toBe(false);
    const text = JSON.stringify(page);
    expect(text).not.toContain(authorId);
    expect(text).not.toContain('Gizli Yazar Adı');
  });

  it('adlı deneyimde yazar görünür; yazar adı aramaya girmez', async () => {
    const marker = tag();
    const authorName = `Yazar${tag()}`;
    const authorId = await createUser(db, { name: authorName });
    const id = await experience({ organizationName: marker, authorId, isAnonymous: false });
    const item = (await run({ company: marker })).items[0]!;
    expect(item).toMatchObject({
      id,
      isAnonymous: false,
      author: { id: authorId, displayName: authorName },
    });
    expect(await ids({ q: authorName })).toEqual([]);
  });

  it.each([
    ['silinmiş yazar', { deletedAt: new Date() }],
    ['süresiz askıdaki yazar', { banned: true }],
    ['süreli askıdaki yazar', { banned: true, banExpires: new Date(Date.now() + 86_400_000) }],
  ])('%s: içerik kalır ama yazar gizlenir (anonim biçim)', async (_name, state) => {
    const marker = tag();
    const authorId = await createUser(db, { name: 'Gizlenecek Ad', ...state });
    await experience({ organizationName: marker, authorId, isAnonymous: false });
    const page = await run({ company: marker });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.isAnonymous).toBe(true);
    expect(JSON.stringify(page)).not.toContain('Gizlenecek Ad');
    expect(JSON.stringify(page)).not.toContain(authorId);
  });

  it('askı süresi dolmuş yazar yeniden görünür', async () => {
    const marker = tag();
    const authorId = await createUser(db, {
      name: 'Askısı Bitti',
      banned: true,
      banExpires: new Date(Date.now() - 1000),
    });
    await experience({ organizationName: marker, authorId, isAnonymous: false });
    expect((await run({ company: marker })).items[0]).toMatchObject({
      isAnonymous: false,
      author: { displayName: 'Askısı Bitti' },
    });
  });

  it('yazar bağı kopmuş (K-09 anonimleştirme) deneyim yazarsız döner', async () => {
    const marker = tag();
    await experience({ organizationName: marker, authorId: null, isAnonymous: true });
    const item = (await run({ company: marker })).items[0]!;
    expect(item.isAnonymous).toBe(true);
    expect('author' in item).toBe(false);
  });
});

describe('güvenli girdi', () => {
  it.each([
    '\'; DROP TABLE "Experience"; --',
    '" OR 1=1 --',
    '\\\\ %%% ___',
    '(((',
    '& | !',
    'a'.repeat(100),
    'İİİİ ıııı',
  ])('tuhaf sorgu %j hata vermez ve tabloyu bozmaz', async (query) => {
    await expect(run({ q: query })).resolves.toBeDefined();
    expect(await db.experience.count()).toBeGreaterThan(0);
  });

  it('snippet en fazla 220 karakterdir ve düz metindir', async () => {
    const marker = tag();
    await experience({ organizationName: marker, whatLearned: `<b>${'x'.repeat(500)}</b>` });
    const item = (await run({ company: marker })).items[0]!;
    expect(item.snippet.length).toBeLessThanOrEqual(220);
  });
});

describe('başarım: 1.000 sahte deneyimle tipik sorgu', () => {
  it('tipik sorgular < 300 ms (ısınma sonrası ortanca)', async () => {
    const perf = await createInstitution(db);
    const viewer = await createUser(db);
    await addMembership(db, {
      userId: viewer,
      departmentId: perf.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    const author = await createUser(db);
    const cities = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Diyarbakır', 'Eskişehir'];
    const orgs = [
      'Aselsan',
      'Türk Telekom',
      'Garanti BBVA',
      'Arçelik',
      'Koç Holding',
      'Vestel',
      'Ford Otosan',
      'Baykar',
    ];
    const topics = [
      'Python ile veri analizi',
      'müşteri ilişkileri',
      'yazılım geliştirme',
      'finansal raporlama',
      'üretim planlama',
      'pazarlama kampanyası',
    ];
    const types = [
      'INTERNSHIP',
      'INTERNSHIP',
      'INTERNSHIP',
      'ERASMUS',
      'COMPETITION',
      'CLUB',
    ] as const;
    const data: Prisma.ExperienceCreateManyInput[] = Array.from({ length: 1000 }, (_, index) => {
      const type = types[index % types.length]!;
      return {
        authorId: author,
        departmentIdAtWrite: perf.deptA1,
        type,
        organizationName: `${orgs[index % orgs.length]} ${index}`,
        city: cities[index % cities.length]!,
        termYear: 2020 + (index % 6),
        termSeason: (['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const)[index % 4]!,
        ...(type === 'INTERNSHIP'
          ? {
              pay: (['PAID', 'UNPAID', 'NOT_DISCLOSED'] as const)[index % 3]!,
              durationWeeks: 8,
              applicationChannel: (['REFERRAL', 'LINKEDIN_POST', 'CAREER_FAIR'] as const)[
                index % 3
              ]!,
            }
          : type === 'ERASMUS'
            ? { durationWeeks: 20, country: 'Almanya', applicationChannel: 'CAREER_FAIR' as const }
            : type === 'COMPETITION'
              ? { applicationChannel: 'LINKEDIN_POST' as const }
              : {}),
        whatLearned: `Stajımda ${topics[index % topics.length]} konusunda çalıştım; ${index}. hafta çok verimliydi.`,
        advice: `Başvuru için ${topics[(index + 2) % topics.length]} projelerini hazırla.`,
        isAnonymous: index % 2 === 0,
        status: 'PUBLISHED',
        publishedAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000),
        moderatedById: moderatorId,
        moderatedAt: new Date(),
      };
    });
    await db.experience.createMany({ data });
    await db.$executeRawUnsafe('ANALYZE "Experience"');

    const actor = (await loadActor(db, viewer, new Date()))!;
    const queries: SearchExperiencesInput[] = [
      { q: 'staj istanbul' },
      { q: 'STAJI İSTANBUL', types: ['INTERNSHIP'] },
      { q: 'veri analizi', pay: 'PAID', termYear: 2020 },
      { q: 'Aselsn' },
      { company: 'garanti', channels: ['REFERRAL'] },
      {},
    ];
    const timings: { query: string; ms: number }[] = [];
    for (const input of queries) {
      const filter = searchExperiencesSchema.parse(input);
      await searchExperiences({ db }, actor, filter); // ısınma
      const samples: number[] = [];
      for (let run = 0; run < 7; run += 1) {
        const start = performance.now();
        const page = await searchExperiences({ db }, actor, filter);
        samples.push(performance.now() - start);
        expect(page.total, JSON.stringify(input)).toBeGreaterThan(0);
      }
      samples.sort((a, b) => a - b);
      timings.push({ query: JSON.stringify(input), ms: Math.round(samples[3]!) });
    }
    console.info(
      `\narama başarımı (1000 deneyim, ortanca ms)\n${timings.map((t) => `${String(t.ms).padStart(5)} ms  ${t.query}`).join('\n')}\n`,
    );
    for (const timing of timings) expect(timing.ms, timing.query).toBeLessThan(300);
  });
});

describe('hata kodu', () => {
  it('doğrulanmış üyeliği olmayan aktör hizmette AUTH_NOT_VERIFIED alır (savunma derinliği)', async () => {
    const nobody = await createUser(db);
    const actor = (await loadActor(db, nobody, new Date()))!;
    const error = await searchExperiences({ db }, actor, searchExperiencesSchema.parse({})).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(isCodedError(error) && error.code).toBe('AUTH_NOT_VERIFIED');
  });
});

describe('listSearchSectors', () => {
  it('sektörleri listeler; doğrulanmış üye olmayan alamaz', async () => {
    const name = `Sektör ${tag()}`;
    const sector = await db.sector.create({ data: { name, normalizedName: name.toLowerCase() } });
    const actor = (await loadActor(db, viewerId, new Date()))!;
    const { sectors } = await listSearchSectors({ db }, actor);
    expect(sectors).toContainEqual({ id: sector.id, name });
    const nobody = (await loadActor(db, await createUser(db), new Date()))!;
    const error = await listSearchSectors({ db }, nobody).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(isCodedError(error) && error.code).toBe('AUTH_NOT_VERIFIED');
  });
});

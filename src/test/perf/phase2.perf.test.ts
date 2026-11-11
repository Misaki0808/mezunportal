import { writeFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CURRENT_CONSENT_VERSIONS } from '@/contracts/privacy';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
  type Institution,
} from '@/test/fixtures';

import { loadActor } from '@/server/permissions/actor';
import { searchExperiencesSchema } from '@/contracts/search';
import {
  aggregateApplicationMonths,
  getApplicationCalendar,
} from '@/server/services/application-window';
import { getCompany, searchCompanies } from '@/server/services/companies';
import { getInterviewQuestions } from '@/server/services/interview-questions';
import { searchJobPostings } from '@/server/services/job-postings';
import { setHiringDeclaration, searchSeekers } from '@/server/services/job-seekers';
import { buildMonthlyDigest } from '@/server/services/monthly-digest';
import { searchExperiences } from '@/server/services/search';

/**
 * Faz 2 performans ölçümü (P2-14; `pnpm test:perf`, YALNIZ yerel): kullanıcının deneme verisinin ~10 katı hacimde (3.000 yayınlanmış
 * deneyim, 1.500 ilan, 100 şirket, 600 kullanıcı, 200 aday) liste/arama yanıt sürelerini ve kritik planları ölçer. Bütçe: p95 < 300 ms
 * (yerel; `PERF_BUDGET_MS` ile değişir). Sonuç `PERF_OUT` dosyasına JSON yazılır. Zamanlama makine yüküne duyarlıdır: bu yüzden `pnpm test`
 * ve CI'da koşmaz; kalıcı koruma plan testleridir (indeks kullanımı), süre değil.
 */
const db = createTestPrisma();
const BUDGET = Number(process.env.PERF_BUDGET_MS ?? 300);
/** Stres hacmi bir pilot yılının üstüdür: hedef değil, gerilemeye karşı üst sınır (bilinen sınırlar docs/engineering.md "Performans"). */
const STRESS_BUDGET = Number(process.env.PERF_STRESS_BUDGET_MS ?? 1000);
const RUNS = 12;
const report: Record<string, { p50: number; p95: number; max: number }> = {};
const plans: Record<string, string> = {};

let inst: Institution;
let viewer: string;
let alumnus: string;
const companyIds: string[] = [];

const pick = <T>(items: readonly T[], i: number) => items[i % items.length]!;
const chunks = <T>(items: T[], size = 1000) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

async function time(name: string, run: () => Promise<unknown>) {
  await run(); // ısınma (planlar/önbellek)
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    await run();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  report[name] = {
    p50: Math.round(samples[Math.floor(RUNS / 2)]!),
    p95: Math.round(samples[Math.floor(RUNS * 0.95) - 1] ?? samples.at(-1)!),
    max: Math.round(samples.at(-1)!),
  };
}

type Captured = { text: string; values: unknown[] };
/** Servisin çalıştırdığı GERÇEK ham SQL'i yakalar (EXPLAIN için); işlem içi `$queryRaw` çağrıları dahil. */
function recordingDb(captured: Captured[]) {
  const wrapRaw = (target: object) =>
    new Proxy(target, {
      get(t, prop, receiver) {
        if (prop === '$queryRaw')
          return (query: unknown, ...rest: unknown[]) => {
            const sql = query as { text?: string; values?: unknown[] };
            if (typeof sql?.text === 'string')
              captured.push({ text: sql.text, values: sql.values ?? [] });
            return (t as typeof db).$queryRaw(query as never, ...(rest as never[]));
          };
        if (prop === '$transaction')
          return (fn: (tx: unknown) => unknown, options?: unknown) =>
            (t as typeof db).$transaction((tx) => fn(wrapRaw(tx)) as never, options as never);
        return Reflect.get(t, prop, receiver) as unknown;
      },
    });
  return wrapRaw(db) as typeof db;
}
async function explainReal(name: string, run: (client: typeof db) => Promise<unknown>) {
  const captured: Captured[] = [];
  await run(recordingDb(captured));
  const main = captured.filter((c) => /\bSELECT\b/i.test(c.text) && !/set_config/i.test(c.text));
  for (const [index, statement] of main.entries()) {
    const rows = await db.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
      `EXPLAIN (ANALYZE, TIMING OFF) ${statement.text}`,
      ...statement.values,
    );
    plans[`gerçek: ${name} #${index + 1}`] = rows.map((r) => r['QUERY PLAN']).join('\n');
  }
}

/**
 * İndeks KULLANILABİLİRLİĞİ kalıcı korumadır: küçük tabloda planlayıcı geçerli olarak sıralı taramayı seçebilir; bu yüzden plan,
 * `enable_seqscan = off` ile alınır (sorguyu bir indeks karşılayabiliyor mu?). Süre ölçümü ayrıca `measureAll`'dadır.
 */
async function plan(name: string, sql: string, ...params: unknown[]) {
  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
    return tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
      `EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF) ${sql}`,
      ...params,
    );
  });
  plans[name] = rows.map((r) => r['QUERY PLAN']).join('\n');
}

type Scale = {
  alumni: number;
  students: number;
  companies: number;
  experiences: number;
  postings: number;
  seekers: number;
};
/** "10×": kullanıcının deneme verisinin (Faz 2 seed'i) yaklaşık on katı. "Stres": bir pilot yılı hacminin üstü. */
const TRIAL_10X: Scale = {
  alumni: 30,
  students: 30,
  companies: 30,
  experiences: 120,
  postings: 60,
  seekers: 20,
};
const STRESS: Scale = {
  alumni: 300,
  students: 300,
  companies: 100,
  experiences: 3000,
  postings: 1500,
  seekers: 200,
};
const have = { alumni: 0, students: 0, companies: 0, experiences: 0, postings: 0, seekers: 0 };
let admin = '';
const alumniIds: string[] = [];
const studentIds: string[] = [];
let emailBase = '';

/** Veriyi `target` hacmine KADAR büyütür (mevcut satırlar korunur); sonunda `ANALYZE` (üretimde autovacuum'un yaptığı gibi). */
async function grow(target: Scale) {
  const now = new Date();
  const range = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k);
  for (const batch of chunks(range(have.alumni, target.alumni), 500)) {
    const rows = await db.user.createManyAndReturn({
      data: batch.map((i) => ({
        name: `Mezun ${i}`,
        email: `${emailBase}-a${i}@test.mezunportal.local`,
        emailVerified: true,
      })),
      select: { id: true },
    });
    await db.membership.createMany({
      data: rows.map((r) => ({
        userId: r.id,
        departmentId: inst.deptA1,
        role: 'ALUMNI' as const,
        graduationYear: 2018,
        verificationStatus: 'VERIFIED' as const,
        verificationMethod: 'GRADUATION_DOCUMENT' as const,
        verifiedAt: now,
        verifiedById: admin,
      })),
    });
    alumniIds.push(...rows.map((r) => r.id));
  }
  have.alumni = target.alumni;
  const newStudents: string[] = [];
  for (const batch of chunks(range(have.students, target.students), 500)) {
    const rows = await db.user.createManyAndReturn({
      data: batch.map((i) => ({
        name: `Öğrenci ${i}`,
        email: `${emailBase}-s${i}@test.mezunportal.local`,
        emailVerified: true,
      })),
      select: { id: true },
    });
    await db.membership.createMany({
      data: rows.map((r) => ({
        userId: r.id,
        departmentId: inst.deptA1,
        role: 'STUDENT' as const,
        entryYear: 2023,
        verificationStatus: 'VERIFIED' as const,
        verificationMethod: 'STUDENT_EMAIL' as const,
        verifiedAt: now,
      })),
    });
    studentIds.push(...rows.map((r) => r.id));
    newStudents.push(...rows.map((r) => r.id));
  }
  have.students = target.students;
  if (target.companies > have.companies) {
    const rows = await db.company.createManyAndReturn({
      data: range(have.companies, target.companies).map((i) => ({
        name: `Performans Şirketi ${i}`,
        normalizedName: `performans sirketi ${emailBase}-${i}`,
        aliases: [],
      })),
      select: { id: true },
    });
    companyIds.push(...rows.map((r) => r.id));
    have.companies = target.companies;
  }
  for (const batch of chunks(range(have.experiences, target.experiences))) {
    await db.experience.createMany({
      data: batch.map((i) => ({
        authorId: i % 20 === 0 ? null : pick(alumniIds, i),
        departmentIdAtWrite: inst.deptA1,
        type: 'INTERNSHIP' as const,
        companyId: pick(companyIds, i),
        organizationName: `Performans Şirketi ${i % target.companies}`,
        country: 'Türkiye',
        city: pick(['İstanbul', 'Ankara', 'İzmir'], i),
        termYear: 2020 + (i % 6),
        termSeason: pick(['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const, i),
        appliedMonth: 1 + (i % 12),
        durationWeeks: 4 + (i % 10),
        pay: 'PAID' as const,
        applicationChannel: 'LINKEDIN_POST' as const,
        processSteps: [{ title: 'Ön eleme', description: 'Form ve kısa görüşme' }],
        interviewQuestions: [`Soru ${i} veri analizi`, `Soru ${i} SQL ve Excel`],
        whatLearned: `Veri analizi ve raporlama öğrendim ${i}`,
        advice: `SQL çalış ${i}`,
        isAnonymous: i % 20 === 0,
        status: 'PUBLISHED' as const,
        moderatedById: admin,
        moderatedAt: now,
        publishedAt: new Date(now.getTime() - i * 3_600_000),
      })),
    });
  }
  have.experiences = target.experiences;
  for (const batch of chunks(range(have.postings, target.postings))) {
    await db.jobPosting.createMany({
      data: batch.map((i) => ({
        authorId: alumnus,
        departmentIdAtWrite: inst.deptA1,
        kind: (i % 3 === 0 ? 'JOB' : 'INTERNSHIP') as 'JOB' | 'INTERNSHIP',
        title: `Performans ilanı ${i} veri analizi`,
        companyId: pick(companyIds, i),
        organizationName: `Performans Şirketi ${i % target.companies}`,
        location: 'İstanbul',
        isRemote: i % 4 === 0,
        description: `Performans ölçümü için örnek ilan metni ${i}: veri analizi ve raporlama.`,
        applyMethod: 'URL' as const,
        applyUrl: `https://ornek.example/${i}`,
        deadlineOn: new Date(now.getTime() + (5 + (i % 50)) * 86_400_000),
        targetGrades: [3, 4],
        status: (i % 3 === 2 ? 'EXPIRED' : 'PUBLISHED') as 'EXPIRED' | 'PUBLISHED',
        submittedAt: new Date(now.getTime() - 4 * 86_400_000),
        moderatedById: admin,
        moderatedAt: new Date(now.getTime() - 3 * 86_400_000),
        publishedAt: new Date(now.getTime() - 3 * 86_400_000 - i * 60_000),
        ...(i % 3 === 2 ? { endedAt: new Date(now.getTime() - 86_400_000) } : {}),
      })),
    });
  }
  have.postings = target.postings;
  const fresh = await db.jobPosting.findMany({
    where: { authorId: alumnus, targets: { none: {} } },
    select: { id: true },
  });
  for (const batch of chunks(fresh))
    await db.jobPostingDepartment.createMany({
      data: batch.map((p) => ({ postingId: p.id, departmentId: inst.deptA1 })),
    });
  // Aday kartları (ters arama): rıza + bayrak + opak kimlik.
  const seekers = newStudents.slice(0, Math.max(0, target.seekers - have.seekers));
  if (seekers.length) {
    await db.consent.createMany({
      data: seekers.map((userId) => ({
        userId,
        documentType: 'JOB_SEEKER_VISIBILITY' as const,
        version: CURRENT_CONSENT_VERSIONS.JOB_SEEKER_VISIBILITY,
        granted: true,
      })),
    });
    await db.profile.createMany({
      data: seekers.map((userId, i) => ({
        userId,
        headline: `Veri meraklısı ${i}`,
        seekingInternship: true,
        seekerRef: `perf-${emailBase}-${have.seekers + i}`.padEnd(20, 'x'),
      })),
    });
    have.seekers += seekers.length;
  }
  for (const table of [
    'User',
    'Membership',
    'Experience',
    'JobPosting',
    'JobPostingDepartment',
    'Company',
    'Profile',
    'Consent',
  ])
    await db.$executeRawUnsafe(`ANALYZE "${table}"`);
}

beforeAll(async () => {
  inst = await createInstitution(db);
  admin = await createUser(db);
  await addMembership(db, { userId: admin, departmentId: inst.deptA1, role: 'ACADEMIC' });
  await addGrant(db, { userId: admin, scope: 'SYSTEM' });
  viewer = await createUser(db);
  await addMembership(db, {
    userId: viewer,
    departmentId: inst.deptA1,
    role: 'STUDENT',
    entryYear: 2024,
  });
  await grantRequiredConsents(db, viewer);
  alumnus = await createUser(db);
  await addMembership(db, {
    userId: alumnus,
    departmentId: inst.deptA1,
    role: 'ALUMNI',
    graduationYear: 2020,
  });
  await grantRequiredConsents(db, alumnus);
  emailBase = `perf-${Date.now()}`;
  await setHiringDeclaration({ db }, alumnus, { hiring: true });
});

afterAll(async () => {
  if (process.env.PERF_OUT)
    writeFileSync(
      process.env.PERF_OUT,
      JSON.stringify(
        { scale: { trial10x: TRIAL_10X, stress: STRESS }, budgetMs: BUDGET, report, plans },
        null,
        2,
      ),
    );
  process.stdout.write(
    `\nFAZ 2 PERFORMANS (p50/p95/max ms, bütçe p95 < ${BUDGET}):\n${Object.entries(report)
      .map(([k, v]) => `  ${k.padEnd(34)} ${v.p50}/${v.p95}/${v.max}`)
      .join('\n')}\n`,
  );
  await db.$disconnect();
});

async function measureAll(label: string, budget: number) {
  const actor = (await loadActor(db, viewer, new Date()))!;
  const company = companyIds[0]!;
  await time(`${label} · ilan listesi`, () => searchJobPostings({ db }, viewer, {}));
  await time(`${label} · ilan arama (metin)`, () =>
    searchJobPostings({ db }, viewer, { q: 'veri analizi' }),
  );
  await time(`${label} · deneyim arama (metin)`, () =>
    searchExperiences({ db }, actor, searchExperiencesSchema.parse({ q: 'veri analizi' })),
  );
  await time(`${label} · deneyim listesi`, () =>
    searchExperiences({ db }, actor, searchExperiencesSchema.parse({})),
  );
  await time(`${label} · şirket arama`, () => searchCompanies({ db }, viewer, 'performans'));
  await time(`${label} · şirket sayfası (k-anonim sayımlar)`, async () => {
    const slug = (await searchCompanies({ db }, viewer, 'performans sirketi 1')).companies[0]?.slug;
    if (slug) await getCompany({ db }, viewer, slug);
  });
  await time(`${label} · soru bankası`, () =>
    getInterviewQuestions(db, viewer, { q: '', companyId: '', sectorId: '' }),
  );
  await time(`${label} · soru bankası (şirket)`, () =>
    getInterviewQuestions(db, viewer, { q: '', companyId: company, sectorId: '' }),
  );
  await time(`${label} · başvuru takvimi (şirket)`, () =>
    getApplicationCalendar(db, viewer, { kind: 'COMPANY', id: company }),
  );
  await time(`${label} · başvuru ayı dağılımı`, () =>
    db.$transaction((tx) =>
      aggregateApplicationMonths(
        tx,
        [inst.universityId],
        { kind: 'COMPANY', id: company },
        new Date(),
      ),
    ),
  );
  await time(`${label} · aylık özet`, () => buildMonthlyDigest(db, viewer));
  await time(`${label} · aday arama (ters arama)`, async () => {
    // Günlük 50 kart sınırı ölçümü kesmesin: her turda sayaç sıfırlanır (süreye ~1 ms eklenir).
    await db.rateLimit.deleteMany({ where: { key: { startsWith: 'app:seeker-cards' } } });
    return searchSeekers({ db }, alumnus, { pageSize: 20 });
  });
  const own = Object.entries(report).filter(([name]) => name.startsWith(label));
  for (const [name, value] of own) expect(value.p95, `${name} p95`).toBeLessThan(budget);
}

describe('Faz 2 liste ve arama yanıt süreleri', () => {
  it('10× deneme verisi: bütçe içindedir', async () => {
    await grow(TRIAL_10X);
    await measureAll('10×', BUDGET);
  });
  it('stres (bir pilot yılının üstü): gerileme sınırı içindedir', async () => {
    await grow(STRESS);
    await measureAll('stres', STRESS_BUDGET);
  });
});

describe('kritik planlar indeks kullanır (stres hacmi)', () => {
  it('yayınlanmış deneyim listesi ve ilan listesi sıralı indeksle, metin ve şirket arama GIN ile çalışır', async () => {
    await plan(
      'deneyim: bölüm + yayın listesi',
      `SELECT id FROM "Experience" WHERE "departmentIdAtWrite" = '${inst.deptA1}' AND status = 'PUBLISHED' ORDER BY "publishedAt" DESC, id LIMIT 20`,
    );
    await plan(
      'deneyim: tam metin',
      `SELECT id FROM "Experience" WHERE "searchVector" @@ plainto_tsquery('simple', '2999') LIMIT 20`,
    );
    await plan(
      'ilan: yayında + son tarih',
      `SELECT id FROM "JobPosting" WHERE status = 'PUBLISHED' AND "deadlineOn" >= current_date ORDER BY "publishedAt" DESC, id LIMIT 20`,
    );
    await plan(
      'ilan: tam metin',
      `SELECT id FROM "JobPosting" WHERE "searchVector" @@ plainto_tsquery('simple', '1499') LIMIT 20`,
    );
    await plan(
      'şirket: izlek (trigram)',
      `SELECT id FROM "Company" WHERE "normalizedName" ILIKE '%performans sirketi 1%' LIMIT 20`,
    );
    await plan(
      'deneyim: şirket sayfası/soru bankası',
      `SELECT id FROM "Experience" WHERE "companyId" = '${companyIds[0]}' AND status = 'PUBLISHED'`,
    );
    const actor = (await loadActor(db, viewer, new Date()))!;
    await explainReal('ilan listesi', (client) => searchJobPostings({ db: client }, viewer, {}));
    await explainReal('soru bankası', (client) =>
      getInterviewQuestions(client, viewer, { q: '', companyId: '', sectorId: '' }),
    );
    await explainReal('deneyim arama', (client) =>
      searchExperiences(
        { db: client },
        actor,
        searchExperiencesSchema.parse({ q: 'veri analizi' }),
      ),
    );
    for (const name of [
      'deneyim: bölüm + yayın listesi',
      'deneyim: tam metin',
      'ilan: yayında + son tarih',
      'ilan: tam metin',
    ]) {
      expect(plans[name], name).toMatch(/Index|Bitmap/);
      expect(plans[name], name).not.toMatch(/Seq Scan on "(Experience|JobPosting)"/);
    }
    expect(plans['deneyim: şirket sayfası/soru bankası']).not.toMatch(/Seq Scan on "Experience"/);
  });
});

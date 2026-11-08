import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import type { CvDecisionInput } from '@/contracts/cv';
import { applyCvSchema, type ParsedCv } from '@/contracts/cv';
import { isCodedError } from '@/lib/errors';
import { cvKit, cvUser, pdfForm, type CvTestKit, skillCount, skillLabels } from '@/test/cv';
import { createTestPrisma } from '@/test/db';
import { createFakeLlm } from '@/server/external/llm/fake';
import { normalizeName } from '../rules/dictionary';
import { loadProfileCompletion } from './profile';

import {
  applyCv,
  discardCv,
  dismissExperienceInvitation,
  getCvReview,
  getLatestCv,
  listExperienceInvitations,
  uploadCv,
} from './cv';
import { processCvParse } from './cv-parse';
import type { Actor } from '../permissions/actor';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

const FRESH = { retryCount: 0, retryLimit: 2 };

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(isCodedError(error), `kodlu hata bekleniyordu (${code})`).toBe(true);
  expect(isCodedError(error) && error.code).toBe(code);
}

const suffix = () => randomUUID().slice(0, 8);
const cv = (overrides: Partial<ParsedCv> = {}): ParsedCv => ({
  profile: { headline: null, summary: null, city: null },
  education: [],
  positions: [],
  skills: [],
  languages: [],
  certifications: [],
  ...overrides,
});
const position = (company: string, extra: Record<string, unknown> = {}) => ({
  company,
  title: 'Yazılım Stajyeri',
  employmentType: 'INTERNSHIP' as const,
  startDate: '2024-07',
  endDate: '2024-09',
  isCurrent: false,
  description: null,
  ...extra,
});

/** Verilen çıktıyı veren sahte LLM ile yüklenip ayrıştırılmış (PARSED) CV. `kit` verilirse depolama/kuyruk paylaşılır. */
async function parsedUpload(
  output: ParsedCv | ((call: number) => ParsedCv),
  who?: { userId: string; actor: Actor },
  kit?: CvTestKit,
) {
  const user = who ?? (await cvUser(db));
  const llm = createFakeLlm({
    scenarios: {
      custom: (_request, call) => (typeof output === 'function' ? output(call) : output),
    },
  });
  const base = kit ?? cvKit(db);
  const deps = { ...base.deps, llm };
  const upload = await uploadCv(deps, user.actor, pdfForm({ scenario: 'custom' }));
  await processCvParse(deps, upload.cvUploadId, FRESH);
  return { ...user, kit: { ...base, deps }, id: upload.cvUploadId };
}

const accept = (keys: string[], extra: Partial<CvDecisionInput> = {}): CvDecisionInput[] =>
  keys.map((key) => ({
    key,
    section: key.split(':')[0] as CvDecisionInput['section'],
    ...extra,
  })) as CvDecisionInput[];
const parseApply = (cvUploadId: string, decisions: CvDecisionInput[]) =>
  applyCvSchema.parse({ cvUploadId, decisions });

const counts = (userId: string) =>
  Promise.all([
    db.education.count({ where: { userId } }),
    db.position.count({ where: { userId } }),
    db.language.count({ where: { userId } }),
    db.certification.count({ where: { userId } }),
    skillCount(db, userId),
  ]);

describe('getCvReview', () => {
  it('boş profilde her kalem NEW; hiçbir şey yazılmaz; sözlük kimlikleri sızmaz', async () => {
    const company = `Rapor-${suffix()}`;
    const { userId, actor, kit, id } = await parsedUpload(
      cv({
        education: [
          {
            institution: 'Örnek Üniversitesi',
            level: 'BACHELOR',
            fieldOfStudy: null,
            startDate: '2021',
            endDate: null,
            isCurrent: true,
          },
        ],
        positions: [position(company)],
        skills: ['SQL'],
        languages: [{ name: 'İngilizce', level: 'B2' }],
      }),
    );
    const review = await getCvReview(kit.deps, actor, id);
    expect(review.items.map((item) => [item.section, item.status])).toEqual([
      ['EDUCATION', 'NEW'],
      ['POSITION', 'NEW'],
      ['LANGUAGE', 'NEW'],
      ['SKILL', 'NEW'],
    ]);
    expect(review.unchangedCount).toBe(0);
    expect(JSON.stringify(review)).not.toMatch(/companyId|titleId|skillId/);
    expect(await counts(userId)).toEqual([0, 0, 0, 0, 0]);
    expect((await db.cvUpload.findUniqueOrThrow({ where: { id } })).status).toBe('PARSED');
  });

  it('sözlükle eşleşen şirket/unvan/beceri standartlaştırılmış adıyla gösterilir; eşleşmeyen null kalır', async () => {
    const tag = suffix();
    const raw = `Aselsan${tag}`;
    await db.company.create({
      data: {
        name: `Aselsan ${tag} Elektronik`,
        normalizedName: normalizeName(`Aselsan ${tag} Elektronik`, 'COMPANY'),
        aliases: [normalizeName(raw, 'COMPANY')],
      },
    });
    await db.skill.create({
      data: {
        name: `TypeScript${tag}`,
        normalizedName: normalizeName(`TypeScript${tag}`),
        aliases: [],
      },
    });
    const { actor, kit, id } = await parsedUpload(
      cv({
        positions: [position(`${raw} A.Ş.`), position(`Bilinmez-${tag}`, { startDate: '2020-01' })],
        skills: [`typescript${tag}`, `nadir-${tag}`],
      }),
    );
    const review = await getCvReview(kit.deps, actor, id);
    const positions = review.items.filter((item) => item.section === 'POSITION');
    expect(positions.map((item) => item.standardized.company)).toEqual([
      `Aselsan ${tag} Elektronik`,
      null,
    ]);
    const skills = review.items.filter((item) => item.section === 'SKILL');
    expect(skills.map((item) => item.standardized.skill)).toEqual([`TypeScript${tag}`, null]);
  });

  it('PARSED olmayan CV CV_NOT_READY; başkasının ya da olmayan CV RESOURCE_NOT_FOUND', async () => {
    const owner = await cvUser(db);
    const stranger = await cvUser(db);
    const kit = cvKit(db);
    const queued = await uploadCv(kit.deps, owner.actor, pdfForm());
    await expectCode(getCvReview(kit.deps, owner.actor, queued.cvUploadId), 'CV_NOT_READY');
    await expectCode(
      getCvReview(kit.deps, stranger.actor, queued.cvUploadId),
      'RESOURCE_NOT_FOUND',
    );
    await expectCode(getCvReview(kit.deps, owner.actor, randomUUID()), 'RESOURCE_NOT_FOUND');
  });
});

describe('applyCv — kullanıcı onayı olmadan yazılmaz', () => {
  it('metrik için işlem dışı skor okuması başarısız olsa da CV uygulaması etkilenmez', async () => {
    const { actor, kit, id } = await parsedUpload(cv({ skills: ['SQL'] }));
    const review = await getCvReview(kit.deps, actor, id);
    const isolated = new Proxy(db, {
      get(target, property) {
        if (property === 'profile')
          return new Proxy(target.profile, {
            get(delegate, key) {
              if (key === 'findUnique')
                return async () => {
                  throw new Error('metrik okuma hatası');
                };
              return Reflect.get(delegate, key);
            },
          });
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const output = await applyCv(
      { ...kit.deps, db: isolated },
      actor,
      parseApply(id, accept(review.items.map((item) => item.key))),
    );
    expect(output.created).toBe(1);
    expect((await db.cvUpload.findUniqueOrThrow({ where: { id } })).status).toBe('APPLIED');
  });

  it('yalnız kabul edilen kalemler yazılır; kararı olmayan kalem profile GİRMEZ', async () => {
    const companyA = `A-${suffix()}`;
    const companyB = `B-${suffix()}`;
    const { userId, actor, kit, id } = await parsedUpload(
      cv({
        positions: [position(companyA), position(companyB, { startDate: '2022-06' })],
        skills: ['SQL', 'Excel', 'Git'],
        languages: [{ name: 'Almanca', level: 'A2' }],
      }),
    );
    const review = await getCvReview(kit.deps, actor, id);
    const pick = (
      section: string,
      predicate: (item: (typeof review.items)[number]) => boolean = () => true,
    ) => review.items.find((item) => item.section === section && predicate(item))!.key;
    const chosen = [
      pick('POSITION', (item) => item.section === 'POSITION' && item.proposed.company === companyA),
      pick('SKILL', (item) => item.section === 'SKILL' && item.proposed.name === 'SQL'),
    ];
    const result = await applyCv(kit.deps, actor, parseApply(id, accept(chosen)));
    expect(result).toEqual({ created: 2, updated: 0, invitations: 1 });
    const intent = await db.notificationIntent.findFirstOrThrow({
      where: { userId, kind: 'generic' },
    });
    expect(intent.payload).toMatchObject({ type: 'generic', event: 'invitation' });
    expect(
      (await db.position.findMany({ where: { userId } })).map((row) => row.companyRaw),
    ).toEqual([companyA]);
    expect(await skillLabels(db, userId)).toEqual(['SQL']);
    expect(await db.language.count({ where: { userId } })).toBe(0);
    expect(await counts(userId)).toEqual([0, 1, 0, 0, 1]);
  });

  it('uygulamadan sonra: çıktı TEMİZ (DB’de null), durum APPLIED, dosya kalır (son CV)', async () => {
    const { userId, actor, kit, id } = await parsedUpload(cv({ skills: ['SQL'] }));
    const review = await getCvReview(kit.deps, actor, id);
    await applyCv(kit.deps, actor, parseApply(id, accept(review.items.map((item) => item.key))));
    const rows = await db.$queryRaw<
      { status: string; parsedJson: unknown; storageKey: string | null; appliedAt: Date | null }[]
    >`
      SELECT "status", "parsedJson", "storageKey", "appliedAt" FROM "CvUpload" WHERE "id" = ${id}`;
    expect(rows[0]).toMatchObject({ status: 'APPLIED', parsedJson: null });
    expect(rows[0]?.appliedAt).toBeInstanceOf(Date);
    expect(rows[0]?.storageKey).toBeTruthy();
    expect(kit.storage.files.has(rows[0]!.storageKey!)).toBe(true);
    expect(await counts(userId)).toEqual([0, 0, 0, 0, 1]);
  });

  it('bayat kalem anahtarı CV_REVIEW_STALE verir ve HİÇBİR şey yazılmaz (geçerli kararlar dahil)', async () => {
    const { userId, actor, kit, id } = await parsedUpload(cv({ skills: ['SQL', 'Git'] }));
    const review = await getCvReview(kit.deps, actor, id);
    const valid = review.items[0]!.key;
    await expectCode(
      applyCv(
        kit.deps,
        actor,
        parseApply(id, [...accept([valid]), { key: 'SKILL:yok', section: 'SKILL' }]),
      ),
      'CV_REVIEW_STALE',
    );
    expect(await counts(userId)).toEqual([0, 0, 0, 0, 0]);
    expect((await db.cvUpload.findUniqueOrThrow({ where: { id } })).status).toBe('PARSED');
  });

  it('kalem bölümü ile karar bölümü uyuşmazsa VALIDATION_INVALID; yazılmaz', async () => {
    const { userId, actor, kit, id } = await parsedUpload(cv({ skills: ['SQL'] }));
    const review = await getCvReview(kit.deps, actor, id);
    await expectCode(
      applyCv(
        kit.deps,
        actor,
        parseApply(id, [{ key: review.items[0]!.key, section: 'LANGUAGE' }]),
      ),
      'VALIDATION_INVALID',
    );
    expect(await counts(userId)).toEqual([0, 0, 0, 0, 0]);
  });

  it('başkasının CV’si uygulanamaz (RESOURCE_NOT_FOUND); sahibi etkilenmez', async () => {
    const owner = await parsedUpload(cv({ skills: ['SQL'] }));
    const stranger = await cvUser(db);
    const review = await getCvReview(owner.kit.deps, owner.actor, owner.id);
    await expectCode(
      applyCv(owner.kit.deps, stranger.actor, parseApply(owner.id, accept([review.items[0]!.key]))),
      'RESOURCE_NOT_FOUND',
    );
    expect(await counts(stranger.userId)).toEqual([0, 0, 0, 0, 0]);
    expect((await db.cvUpload.findUniqueOrThrow({ where: { id: owner.id } })).status).toBe(
      'PARSED',
    );
  });

  it('eşzamanlı iki uygulama: biri başarılı, diğeri CV_NOT_READY; kalemler çiftlenmez', async () => {
    const { userId, actor, kit, id } = await parsedUpload(
      cv({ skills: ['SQL', 'Git'], languages: [{ name: 'Almanca', level: null }] }),
    );
    const review = await getCvReview(kit.deps, actor, id);
    const input = parseApply(id, accept(review.items.map((item) => item.key)));
    const outcomes = await Promise.allSettled([
      applyCv(kit.deps, actor, input),
      applyCv(kit.deps, actor, input),
      applyCv(kit.deps, actor, input),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected')
        expect(isCodedError(outcome.reason) && outcome.reason.code).toBe('CV_NOT_READY');
    }
    expect(await counts(userId)).toEqual([0, 0, 1, 0, 2]);
  });
});

describe('applyCv — elle düzeltilen kalem sessizce ezilmez', () => {
  async function userWithManualPosition() {
    const tag = suffix();
    const company = `Elle-${tag}`;
    const user = await cvUser(db);
    const row = await db.position.create({
      data: {
        userId: user.userId,
        companyRaw: company,
        titleRaw: 'Benim yazdığım unvan',
        employmentType: 'INTERNSHIP',
        startYear: 2024,
        startMonth: 7,
        endYear: 2024,
        endMonth: 9,
        source: 'CV',
        manuallyEdited: true,
      },
    });
    return { ...user, company, rowId: row.id };
  }

  it('CV farklıysa CONFLICT olarak AYRI gösterilir (mevcut ve önerilen değerle)', async () => {
    const mine = await userWithManualPosition();
    const { kit, id } = await parsedUpload(
      cv({ positions: [position(mine.company, { title: 'CV’deki unvan' })] }),
      mine,
    );
    const review = await getCvReview(kit.deps, mine.actor, id);
    expect(review.items).toHaveLength(1);
    expect(review.items[0]).toMatchObject({
      section: 'POSITION',
      status: 'CONFLICT',
      changedFields: ['title'],
      current: { title: 'Benim yazdığım unvan' },
      proposed: { title: 'CV’deki unvan' },
    });
  });

  it('açık seçim yoksa CV_CONFLICT_UNRESOLVED; yazılmaz', async () => {
    const mine = await userWithManualPosition();
    const { kit, id } = await parsedUpload(
      cv({ positions: [position(mine.company, { title: 'CV’deki unvan' })], skills: ['SQL'] }),
      mine,
    );
    const review = await getCvReview(kit.deps, mine.actor, id);
    const conflict = review.items.find((item) => item.status === 'CONFLICT')!;
    await expectCode(
      applyCv(kit.deps, mine.actor, parseApply(id, accept([conflict.key]))),
      'CV_CONFLICT_UNRESOLVED',
    );
    expect((await db.position.findUniqueOrThrow({ where: { id: mine.rowId } })).titleRaw).toBe(
      'Benim yazdığım unvan',
    );
  });

  it('çakışan kalem hiç seçilmezse elle yazılan değer aynen kalır; yeni kalemler yine yazılır', async () => {
    const mine = await userWithManualPosition();
    const { kit, id } = await parsedUpload(
      cv({ positions: [position(mine.company, { title: 'CV’deki unvan' })], skills: ['SQL'] }),
      mine,
    );
    const review = await getCvReview(kit.deps, mine.actor, id);
    const fresh = review.items.filter((item) => item.status === 'NEW').map((item) => item.key);
    await applyCv(kit.deps, mine.actor, parseApply(id, accept(fresh)));
    const row = await db.position.findUniqueOrThrow({ where: { id: mine.rowId } });
    expect(row).toMatchObject({ titleRaw: 'Benim yazdığım unvan', manuallyEdited: true });
    expect(await skillCount(db, mine.userId)).toBe(1);
  });

  it('overwriteMine ile açıkça seçilirse YALNIZ değişen alanlar güncellenir; kalem korumalı kalır', async () => {
    const mine = await userWithManualPosition();
    const { kit, id } = await parsedUpload(
      cv({ positions: [position(mine.company, { title: 'CV’deki unvan' })] }),
      mine,
    );
    const review = await getCvReview(kit.deps, mine.actor, id);
    const result = await applyCv(
      kit.deps,
      mine.actor,
      parseApply(id, accept([review.items[0]!.key], { overwriteMine: true })),
    );
    expect(result).toMatchObject({ created: 0, updated: 1 });
    const row = await db.position.findUniqueOrThrow({ where: { id: mine.rowId } });
    expect(row).toMatchObject({
      titleRaw: 'CV’deki unvan',
      startYear: 2024,
      endMonth: 9,
      manuallyEdited: true,
    });
  });

  it('YENİ CV GELİNCE: önce uygulanmış kalem kullanıcı düzeltince korunur; sonraki CV onu ezmez', async () => {
    const company = `Zincir-${suffix()}`;
    const user = await cvUser(db);
    const first = await parsedUpload(cv({ positions: [position(company)] }), user);
    const firstReview = await getCvReview(first.kit.deps, user.actor, first.id);
    await applyCv(
      first.kit.deps,
      user.actor,
      parseApply(first.id, accept(firstReview.items.map((item) => item.key))),
    );
    // Kullanıcı kalemi elle düzeltir (P1-06 ekranı `manuallyEdited` işaretler).
    const row = await db.position.findFirstOrThrow({ where: { userId: user.userId } });
    await db.position.update({
      where: { id: row.id },
      data: { titleRaw: 'Düzelttiğim unvan', manuallyEdited: true },
    });
    const second = await parsedUpload(
      cv({ positions: [position(company, { title: 'Yeni CV unvanı', endDate: '2024-10' })] }),
      user,
      first.kit,
    );
    const review = await getCvReview(second.kit.deps, user.actor, second.id);
    expect(review.items).toHaveLength(1);
    expect(review.items[0]).toMatchObject({
      status: 'CONFLICT',
      changedFields: ['title', 'endDate'],
    });
    // Kullanıcı hiçbir şey seçmeden atar: kalem aynı kalır.
    await discardCv(second.kit.deps, user.actor, second.id);
    expect(await db.position.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      titleRaw: 'Düzelttiğim unvan',
      endMonth: 9,
    });
  });

  it('elle düzeltilmemiş kalem CHANGED olur ve yalnız değişen alan güncellenir', async () => {
    const company = `Degisen-${suffix()}`;
    const user = await cvUser(db);
    const first = await parsedUpload(
      cv({ positions: [position(company, { description: 'ilk açıklama' })] }),
      user,
    );
    const r1 = await getCvReview(first.kit.deps, user.actor, first.id);
    await applyCv(
      first.kit.deps,
      user.actor,
      parseApply(first.id, accept(r1.items.map((item) => item.key))),
    );
    const second = await parsedUpload(
      cv({ positions: [position(company, { endDate: '2024-10', description: null })] }),
      user,
      first.kit,
    );
    const r2 = await getCvReview(second.kit.deps, user.actor, second.id);
    expect(r2.items[0]).toMatchObject({ status: 'CHANGED', changedFields: ['endDate'] });
    await applyCv(second.kit.deps, user.actor, parseApply(second.id, accept([r2.items[0]!.key])));
    // CV’de açıklama yoktu (null): profildeki açıklama SİLİNMEZ.
    expect(await db.position.findFirstOrThrow({ where: { userId: user.userId } })).toMatchObject({
      endMonth: 10,
      description: 'ilk açıklama',
      manuallyEdited: false,
    });
  });

  it('kullanıcı öneriyi onay ekranında düzeltirse (values) kalem "elle düzeltilmiş" olur ve bir sonraki CV’de CONFLICT çıkar', async () => {
    const company = `Duzelt-${suffix()}`;
    const user = await cvUser(db);
    const first = await parsedUpload(cv({ positions: [position(company)] }), user);
    const review = await getCvReview(first.kit.deps, user.actor, first.id);
    const item = review.items[0]!;
    if (item.section !== 'POSITION') throw new Error('beklenmeyen bölüm');
    await applyCv(
      first.kit.deps,
      user.actor,
      parseApply(first.id, [
        {
          key: item.key,
          section: 'POSITION',
          values: { ...item.proposed, title: 'Düzeltilmiş unvan' },
        },
      ]),
    );
    expect(await db.position.findFirstOrThrow({ where: { userId: user.userId } })).toMatchObject({
      titleRaw: 'Düzeltilmiş unvan',
      manuallyEdited: true,
      source: 'CV',
    });
    const second = await parsedUpload(cv({ positions: [position(company)] }), user, first.kit);
    const next = await getCvReview(second.kit.deps, user.actor, second.id);
    expect(next.items[0]).toMatchObject({ status: 'CONFLICT' });
  });

  it('öneriyle aynı bırakılan değer ("values" verilse bile) kalemi elle düzeltilmiş yapmaz', async () => {
    const company = `Ayni-${suffix()}`;
    const user = await cvUser(db);
    const first = await parsedUpload(cv({ positions: [position(company)] }), user);
    const review = await getCvReview(first.kit.deps, user.actor, first.id);
    const item = review.items[0]!;
    if (item.section !== 'POSITION') throw new Error('beklenmeyen bölüm');
    await applyCv(
      first.kit.deps,
      user.actor,
      parseApply(first.id, [{ key: item.key, section: 'POSITION', values: { ...item.proposed } }]),
    );
    expect(
      (await db.position.findFirstOrThrow({ where: { userId: user.userId } })).manuallyEdited,
    ).toBe(false);
  });
});

describe('applyCv — sözlük ve yönetici kuyruğu', () => {
  it('eşleşen şirket/unvan sözlük kimliğine bağlanır; eşleşmeyen onaylanınca UnmatchedValue sayılır', async () => {
    const tag = suffix();
    const sector = await db.sector.create({
      data: { name: `Sektör ${tag}`, normalizedName: normalizeName(`Sektör ${tag}`) },
    });
    const known = await db.company.create({
      data: {
        name: `Bilinen ${tag}`,
        normalizedName: normalizeName(`Bilinen ${tag}`, 'COMPANY'),
        aliases: [],
        sectorId: sector.id,
      },
    });
    const unknown = `Tanımsız-${tag}`;
    const { userId, actor, kit, id } = await parsedUpload(
      cv({
        positions: [
          position(`BİLİNEN ${tag} A.Ş.`),
          position(unknown, { startDate: '2021-01', endDate: '2021-03' }),
        ],
      }),
    );
    const review = await getCvReview(kit.deps, actor, id);
    await applyCv(kit.deps, actor, parseApply(id, accept(review.items.map((item) => item.key))));
    const rows = await db.position.findMany({ where: { userId }, orderBy: { startYear: 'asc' } });
    expect(rows[1]).toMatchObject({
      companyId: known.id,
      sectorId: sector.id,
      companyRaw: `BİLİNEN ${tag} A.Ş.`,
    });
    expect(rows[0]).toMatchObject({ companyId: null, companyRaw: unknown });
    const unmatched = await db.unmatchedValue.findUniqueOrThrow({
      where: {
        kind_normalizedValue: {
          kind: 'COMPANY',
          normalizedValue: normalizeName(unknown, 'COMPANY'),
        },
      },
    });
    expect(unmatched).toMatchObject({ count: 1, rawValue: unknown, resolvedToId: null });
    // Eşleşen şirket kuyruğa girmez.
    expect(
      await db.unmatchedValue.count({
        where: { kind: 'COMPANY', normalizedValue: normalizeName(`Bilinen ${tag}`, 'COMPANY') },
      }),
    ).toBe(0);
  });

  it('aynı eşleşmeyen değeri ikinci kullanıcı da onaylarsa sayaç artar; ATILAN (seçilmeyen) değer kuyruğa girmez', async () => {
    const unknown = `Ortak-${suffix()}`;
    const output = cv({ positions: [position(unknown)] });
    for (let user = 0; user < 2; user += 1) {
      const { actor, kit, id } = await parsedUpload(output);
      const review = await getCvReview(kit.deps, actor, id);
      await applyCv(kit.deps, actor, parseApply(id, accept(review.items.map((item) => item.key))));
    }
    const rejected = `Atilan-${suffix()}`;
    const dropped = await parsedUpload(cv({ positions: [position(rejected)], skills: ['SQL'] }));
    const review = await getCvReview(dropped.kit.deps, dropped.actor, dropped.id);
    await applyCv(
      dropped.kit.deps,
      dropped.actor,
      parseApply(
        dropped.id,
        accept(review.items.filter((item) => item.section === 'SKILL').map((item) => item.key)),
      ),
    );
    const row = await db.unmatchedValue.findUniqueOrThrow({
      where: {
        kind_normalizedValue: {
          kind: 'COMPANY',
          normalizedValue: normalizeName(unknown, 'COMPANY'),
        },
      },
    });
    expect(row.count).toBe(2);
    expect(
      await db.unmatchedValue.count({
        where: { normalizedValue: normalizeName(rejected, 'COMPANY') },
      }),
    ).toBe(0);
  });

  it('eşik altı benzerlik eşleşmez; 4 karakterden kısa adlarda yalnız tam eşleşme geçer', async () => {
    const tag = suffix();
    await db.company.create({
      data: {
        name: `Kalkan Savunma ${tag}`,
        normalizedName: normalizeName(`Kalkan Savunma ${tag}`, 'COMPANY'),
        aliases: [],
      },
    });
    await db.skill.create({
      data: { name: `Golang${tag}`, normalizedName: normalizeName(`Golang${tag}`), aliases: [] },
    });
    const { actor, kit, id } = await parsedUpload(
      cv({ positions: [position(`Tamamen Başka Şirket ${tag}`)], skills: ['Go'] }),
    );
    const review = await getCvReview(kit.deps, actor, id);
    expect(
      review.items
        .filter((item) => item.section === 'POSITION')
        .map((item) => item.standardized.company),
    ).toEqual([null]);
    expect(
      review.items
        .filter((item) => item.section === 'SKILL')
        .map((item) => item.standardized.skill),
    ).toEqual([null]);
  });
});

describe('applyCv — staj → deneyim daveti', () => {
  it('her yeni staj için bir davet oluşur; staj olmayan pozisyon davet üretmez; liste ve kapatma çalışır', async () => {
    const intern = `Staj-${suffix()}`;
    const regular = `Tam-${suffix()}`;
    const { userId, actor, kit, id } = await parsedUpload(
      cv({
        positions: [
          position(intern),
          position(regular, {
            employmentType: 'FULL_TIME',
            startDate: '2022-01',
            endDate: null,
            isCurrent: true,
          }),
        ],
      }),
    );
    const review = await getCvReview(kit.deps, actor, id);
    const result = await applyCv(
      kit.deps,
      actor,
      parseApply(id, accept(review.items.map((item) => item.key))),
    );
    expect(result.invitations).toBe(1);
    const listed = await listExperienceInvitations(kit.deps, actor);
    expect(listed.invitations).toEqual([
      expect.objectContaining({
        company: intern,
        title: 'Yazılım Stajyeri',
        startDate: '2024-07',
        endDate: '2024-09',
      }),
    ]);
    // Başka kullanıcı bu daveti kapatamaz ve görmez.
    const stranger = await cvUser(db);
    await expectCode(
      dismissExperienceInvitation(kit.deps, stranger.actor, listed.invitations[0]!.id),
      'RESOURCE_NOT_FOUND',
    );
    expect((await listExperienceInvitations(kit.deps, stranger.actor)).invitations).toEqual([]);
    await dismissExperienceInvitation(kit.deps, actor, listed.invitations[0]!.id);
    expect((await listExperienceInvitations(kit.deps, actor)).invitations).toEqual([]);
    expect(await db.experienceInvitation.count({ where: { userId } })).toBe(1);
  });

  it('aynı staj yeni CV’de değişirse davet çiftlenmez ve kapatılmış davet yeniden açılmaz', async () => {
    const company = `Tekrar-${suffix()}`;
    const user = await cvUser(db);
    const first = await parsedUpload(cv({ positions: [position(company)] }), user);
    const r1 = await getCvReview(first.kit.deps, user.actor, first.id);
    await applyCv(
      first.kit.deps,
      user.actor,
      parseApply(first.id, accept(r1.items.map((item) => item.key))),
    );
    const invitation = (await listExperienceInvitations(first.kit.deps, user.actor))
      .invitations[0]!;
    await dismissExperienceInvitation(first.kit.deps, user.actor, invitation.id);
    const second = await parsedUpload(
      cv({ positions: [position(company, { endDate: '2024-10' })] }),
      user,
      first.kit,
    );
    const r2 = await getCvReview(second.kit.deps, user.actor, second.id);
    const result = await applyCv(
      second.kit.deps,
      user.actor,
      parseApply(second.id, accept(r2.items.map((item) => item.key))),
    );
    expect(result.invitations).toBe(0);
    expect(await db.experienceInvitation.findMany({ where: { userId: user.userId } })).toHaveLength(
      1,
    );
    expect((await listExperienceInvitations(first.kit.deps, user.actor)).invitations).toEqual([]);
  });
});

describe('Saklama kuralları', () => {
  async function applied(
    user: Awaited<ReturnType<typeof cvUser>>,
    kit: CvTestKit,
    output: ParsedCv,
  ) {
    const upload = await parsedUpload(output, user, kit);
    const review = await getCvReview(kit.deps, user.actor, upload.id);
    await applyCv(
      kit.deps,
      user.actor,
      parseApply(upload.id, accept(review.items.map((item) => item.key))),
    );
    return upload.id;
  }

  it('yeni CV uygulanınca ESKİ CV dosyaları silinir, son dosya kalır', async () => {
    const user = await cvUser(db);
    const kit = cvKit(db);
    const first = await applied(user, kit, cv({ skills: [`a${suffix()}`] }));
    const firstKey = (await db.cvUpload.findUniqueOrThrow({ where: { id: first } })).storageKey!;
    expect(kit.storage.files.has(firstKey)).toBe(true);
    const second = await applied(user, kit, cv({ skills: [`b${suffix()}`] }));
    const secondRow = await db.cvUpload.findUniqueOrThrow({ where: { id: second } });
    expect(kit.storage.files.has(firstKey)).toBe(false);
    expect((await db.cvUpload.findUniqueOrThrow({ where: { id: first } })).storageKey).toBeNull();
    expect(kit.storage.files.has(secondRow.storageKey!)).toBe(true);
    expect(kit.storage.files.size).toBe(1);
  });

  it('açık CV inceleme talebine bağlı eski dosya SİLİNMEZ (talep kapanana kadar)', async () => {
    const user = await cvUser(db);
    const kit = cvKit(db);
    const first = await applied(user, kit, cv({ skills: [`a${suffix()}`] }));
    const firstKey = (await db.cvUpload.findUniqueOrThrow({ where: { id: first } })).storageKey!;
    const held = async (_tx: unknown, ids: readonly string[]) =>
      new Set(ids.filter((id) => id === first));
    const heldKit = { ...kit, deps: { ...kit.deps, holds: [held as never] } };
    await applied(user, heldKit, cv({ skills: [`b${suffix()}`] }));
    expect(kit.storage.files.has(firstKey)).toBe(true);
    expect((await db.cvUpload.findUniqueOrThrow({ where: { id: first } })).storageKey).toBe(
      firstKey,
    );
  });

  it('dosya silme başarısızsa uygulama GERİ ALINIR: kalem yazılmaz, CV PARSED kalır, yeniden denenebilir', async () => {
    const user = await cvUser(db);
    const kit = cvKit(db);
    await applied(user, kit, cv({ skills: [`a${suffix()}`] }));
    const upload = await parsedUpload(cv({ skills: [`b${suffix()}`, `c${suffix()}`] }), user, kit);
    const review = await getCvReview(kit.deps, user.actor, upload.id);
    const input = parseApply(upload.id, accept(review.items.map((item) => item.key)));
    kit.storage.failures.delete = true;
    await expect(applyCv(kit.deps, user.actor, input)).rejects.toBeDefined();
    kit.storage.failures.delete = false;
    expect(await skillCount(db, user.userId)).toBe(1);
    expect((await db.cvUpload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe(
      'PARSED',
    );
    await applyCv(kit.deps, user.actor, input);
    expect(await skillCount(db, user.userId)).toBe(3);
  });

  it('atma: çıktı temizlenir, dosya silinir; ikinci atma ve atılan CV’nin uygulanması CV_NOT_READY', async () => {
    const { userId, actor, kit, id } = await parsedUpload(cv({ skills: ['SQL'] }));
    const key = (await db.cvUpload.findUniqueOrThrow({ where: { id } })).storageKey!;
    const review = await getCvReview(kit.deps, actor, id);
    expect(await getLatestCv(kit.deps, actor)).toMatchObject({ cvUploadId: id, status: 'PARSED' });
    expect(await discardCv(kit.deps, actor, id)).toEqual({ discarded: true });
    // Atılan CV "son CV" sayılmaz (ekran boş duruma döner).
    expect(await getLatestCv(kit.deps, actor)).toBeNull();
    expect(await db.cvUpload.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'DISCARDED',
      parsedJson: null,
      storageKey: null,
    });
    expect(kit.storage.files.has(key)).toBe(false);
    await expectCode(discardCv(kit.deps, actor, id), 'CV_NOT_READY');
    await expectCode(
      applyCv(kit.deps, actor, parseApply(id, accept([review.items[0]!.key]))),
      'CV_NOT_READY',
    );
    expect(await counts(userId)).toEqual([0, 0, 0, 0, 0]);
  });

  it('atma da açık incelemeye bağlı dosyayı silmez', async () => {
    const { actor, kit, id } = await parsedUpload(cv({ skills: ['SQL'] }));
    const key = (await db.cvUpload.findUniqueOrThrow({ where: { id } })).storageKey!;
    const held = async (_tx: unknown, ids: readonly string[]) => new Set(ids);
    await discardCv({ ...kit.deps, holds: [held as never] }, actor, id);
    expect(kit.storage.files.has(key)).toBe(true);
    expect((await db.cvUpload.findUniqueOrThrow({ where: { id } })).status).toBe('DISCARDED');
  });
});

describe('PROFILE kalemi (başlık, özet, şehir)', () => {
  const profileOf = (
    headline: string | null,
    summary: string | null = null,
    city: string | null = null,
  ) => ({
    headline,
    summary,
    city,
  });

  it('boş profile NEW gelir; uygulanınca alanlar yazılır, profil açılır ve cvUpdatedAt işaretlenir', async () => {
    const { userId, actor, kit, id } = await parsedUpload(
      cv({ profile: profileOf('Veri Analisti', 'Kısa özet', 'İstanbul'), skills: ['SQL'] }),
    );
    const review = await getCvReview(kit.deps, actor, id);
    const item = review.items.find((entry) => entry.section === 'PROFILE')!;
    expect(item).toMatchObject({
      status: 'NEW',
      changedFields: ['headline', 'summary', 'city'],
      current: null,
    });
    expect(await db.profile.findUnique({ where: { userId } })).toBeNull();
    await applyCv(kit.deps, actor, parseApply(id, accept([item.key])));
    const row = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect(row).toMatchObject({
      headline: 'Veri Analisti',
      summary: 'Kısa özet',
      city: 'İstanbul',
      manualFields: [],
    });
    expect(row.cvUpdatedAt).toBeInstanceOf(Date);
    // CV uygulama da profil yazımıdır: saklı skor tamamlama kuralındaki yüzdeyle aynıdır.
    expect(row.completionScore).toBe((await loadProfileCompletion(db, userId, new Date())).percent);
    expect(row.completionScore).toBeGreaterThan(0);
  });

  it('CV’de olmayan alan fark sayılmaz; aynı değer listelenmez', async () => {
    const user = await cvUser(db);
    await db.profile.create({ data: { userId: user.userId, headline: 'Aynı', city: 'Ankara' } });
    const { actor, kit, id } = await parsedUpload(
      cv({ profile: profileOf('aynı', null, null), skills: ['SQL'] }),
      user,
    );
    const review = await getCvReview(kit.deps, actor, id);
    expect(review.items.some((entry) => entry.section === 'PROFILE')).toBe(false);
    expect(review.unchangedCount).toBe(1);
  });

  it('elle yazılan alan çakışmadır: açık seçim olmadan yazılmaz; hiç seçilmezse aynen kalır', async () => {
    const user = await cvUser(db);
    await db.profile.create({
      data: {
        userId: user.userId,
        headline: 'Benim başlığım',
        city: 'Ankara',
        manualFields: ['headline'],
      },
    });
    const { actor, kit, id } = await parsedUpload(
      cv({ profile: profileOf('CV başlığı', null, 'İzmir'), skills: ['SQL'] }),
      user,
    );
    const review = await getCvReview(kit.deps, actor, id);
    const item = review.items.find((entry) => entry.section === 'PROFILE')!;
    expect(item).toMatchObject({ status: 'CONFLICT', changedFields: ['headline', 'city'] });
    await expectCode(
      applyCv(kit.deps, actor, parseApply(id, accept([item.key]))),
      'CV_CONFLICT_UNRESOLVED',
    );
    // Hiç seçmeden yalnız beceriyi uygula: profil değişmez.
    const skill = review.items.find((entry) => entry.section === 'SKILL')!;
    await applyCv(kit.deps, actor, parseApply(id, accept([skill.key])));
    expect(await db.profile.findUniqueOrThrow({ where: { userId: user.userId } })).toMatchObject({
      headline: 'Benim başlığım',
      city: 'Ankara',
    });
  });

  it('overwriteMine ile yazılır ve alan korumalı kalır; kullanıcı düzeltirse (values) alan elle yazılmış sayılır', async () => {
    const user = await cvUser(db);
    await db.profile.create({
      data: { userId: user.userId, headline: 'Eski', manualFields: ['headline'] },
    });
    const first = await parsedUpload(cv({ profile: profileOf('Yeni CV başlığı') }), user);
    const review = await getCvReview(first.kit.deps, user.actor, first.id);
    const item = review.items[0]!;
    await applyCv(
      first.kit.deps,
      user.actor,
      parseApply(first.id, accept([item.key], { overwriteMine: true })),
    );
    expect(await db.profile.findUniqueOrThrow({ where: { userId: user.userId } })).toMatchObject({
      headline: 'Yeni CV başlığı',
      manualFields: ['headline'],
    });

    const clean = await cvUser(db);
    const second = await parsedUpload(cv({ profile: profileOf(null, 'Özet', 'Bursa') }), clean);
    const r2 = await getCvReview(second.kit.deps, clean.actor, second.id);
    const it2 = r2.items[0]!;
    if (it2.section !== 'PROFILE') throw new Error('beklenmeyen bölüm');
    await applyCv(
      second.kit.deps,
      clean.actor,
      parseApply(second.id, [
        { key: it2.key, section: 'PROFILE', values: { ...it2.proposed, city: 'Düzeltilmiş' } },
      ]),
    );
    expect(await db.profile.findUniqueOrThrow({ where: { userId: clean.userId } })).toMatchObject({
      summary: 'Özet',
      city: 'Düzeltilmiş',
      manualFields: expect.arrayContaining(['city']),
    });
  });

  it('elle düzenleme sonrası (updateProfileBasics yolu) yeni CV çakışma gösterir', async () => {
    const user = await cvUser(db);
    await db.profile.create({
      data: { userId: user.userId, summary: 'Elle özet', manualFields: ['summary'] },
    });
    const { actor, kit, id } = await parsedUpload(
      cv({ profile: profileOf(null, 'Farklı özet') }),
      user,
    );
    expect((await getCvReview(kit.deps, actor, id)).items[0]).toMatchObject({
      section: 'PROFILE',
      status: 'CONFLICT',
    });
  });
});

describe('beceriler Tag (SKILL) olarak yazılır', () => {
  it('sözlükteki beceri kurallı etiket olur; sözlükte yoksa kişisel etiket ve yönetici kuyruğu; yeniden uygulanınca çiftlenmez', async () => {
    const tagName = suffix();
    const canonical = `Python${tagName}`;
    await db.skill.create({
      data: { name: canonical, normalizedName: canonical.toLowerCase(), aliases: [] },
    });
    const custom = `ozelbeceri${tagName}`;
    const user = await cvUser(db);
    const first = await parsedUpload(cv({ skills: [canonical.toUpperCase(), custom] }), user);
    const review = await getCvReview(first.kit.deps, user.actor, first.id);
    await applyCv(
      first.kit.deps,
      user.actor,
      parseApply(first.id, accept(review.items.map((item) => item.key))),
    );
    expect((await skillLabels(db, user.userId)).sort()).toEqual([canonical, custom].sort());
    expect(
      await db.tag.findFirstOrThrow({ where: { kind: 'SKILL', label: canonical } }),
    ).toMatchObject({ curated: true });
    expect(
      await db.tag.findFirstOrThrow({ where: { kind: 'SKILL', label: custom } }),
    ).toMatchObject({ curated: false });
    expect(await db.unmatchedValue.count({ where: { kind: 'SKILL', rawValue: custom } })).toBe(1);

    const second = await parsedUpload(
      cv({ skills: [canonical, custom.toUpperCase(), `yeni${tagName}`] }),
      user,
      first.kit,
    );
    const r2 = await getCvReview(second.kit.deps, user.actor, second.id);
    expect(
      r2.items.map((item) => (item.section === 'SKILL' ? item.proposed.name : item.section)),
    ).toEqual([`yeni${tagName}`]);
    expect(r2.unchangedCount).toBe(2);
  });

  it('kullanıcının profilden eklediği beceri CV onayında yeniden önerilmez', async () => {
    const user = await cvUser(db);
    const name = `elle${suffix()}`;
    const profile = await db.profile.create({ data: { userId: user.userId } });
    const created = await db.tag.create({
      data: { kind: 'SKILL', slug: name, label: name, curated: false },
    });
    await db.profileTag.create({ data: { profileId: profile.id, tagId: created.id } });
    const { actor, kit, id } = await parsedUpload(cv({ skills: [name.toUpperCase()] }), user);
    expect((await getCvReview(kit.deps, actor, id)).items).toEqual([]);
  });
});

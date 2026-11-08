import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  type Institution,
} from '@/test/fixtures';

import {
  createDictionaryEntry,
  deleteDictionaryEntry,
  listDictionaryEntries,
  listUnmatchedValues,
  resolveUnmatchedValue,
  updateDictionaryEntry,
} from './admin-dictionary';
import { getAdminOverview } from './admin-panel';
import { recordUnmatched } from './cv-dictionary';
import { normalizeName } from '../rules/dictionary';

const db = createTestPrisma();
const deps = { db };
afterAll(() => db.$disconnect());

let inst: Institution;
let system: string;
let deptAdmin: string;

beforeAll(async () => {
  inst = await createInstitution(db);
  system = await createUser(db);
  await addMembership(db, { userId: system, departmentId: inst.deptA1, role: 'ACADEMIC' });
  await addGrant(db, { userId: system, scope: 'SYSTEM' });
  deptAdmin = await createUser(db);
  await addMembership(db, { userId: deptAdmin, departmentId: inst.deptA1, role: 'ACADEMIC' });
  await addGrant(db, { userId: deptAdmin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
});

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(isCodedError(error), `kodlu hata bekleniyordu (${code}); gelen: ${String(error)}`).toBe(
    true,
  );
  expect(isCodedError(error) && error.code).toBe(code);
}
const tag = () => `zq${randomUUID().replace(/-/g, '').slice(0, 10)}`;
const auditOf = (targetId: string) =>
  db.adminAuditLog.findMany({ where: { targetId }, orderBy: { createdAt: 'asc' } });
const REASON = 'Yinelenen kayıt temizliği';

// =============================================================================================
describe('yetki', () => {
  it('sözlük ve eşleşmeyen değer eylemleri yalnız sistem yöneticisine açıktır; hiçbir şey yazılmaz', async () => {
    const name = `Yasak ${tag()}`;
    const entry = await createDictionaryEntry(deps, system, { kind: 'TITLE', name });
    const unmatched = await db.unmatchedValue.create({
      data: { kind: 'TITLE', rawValue: tag(), normalizedValue: tag() },
    });
    const plain = await createUser(db);
    const callers: [string, string][] = [
      [deptAdmin, 'AUTH_FORBIDDEN'],
      [plain, 'AUTH_FORBIDDEN'],
      [randomUUID(), 'AUTH_UNAUTHENTICATED'],
    ];
    for (const [userId, code] of callers) {
      await expectCode(listDictionaryEntries(deps, userId, { kind: 'TITLE' }), code);
      await expectCode(createDictionaryEntry(deps, userId, { kind: 'TITLE', name: tag() }), code);
      await expectCode(
        updateDictionaryEntry(deps, userId, { kind: 'TITLE', id: entry.id, name: tag() }),
        code,
      );
      await expectCode(
        deleteDictionaryEntry(deps, userId, {
          kind: 'TITLE',
          id: entry.id,
          reason: REASON,
          confirmed: true,
        }),
        code,
      );
      await expectCode(listUnmatchedValues(deps, userId, {}), code);
      await expectCode(
        resolveUnmatchedValue(deps, userId, {
          id: unmatched.id,
          resolution: { type: 'DISMISS', reason: REASON, confirmed: true },
        }),
        code,
      );
    }
    expect(
      await db.title.count({
        where: { id: entry.id, normalizedName: normalizeName(name, 'TITLE') },
      }),
    ).toBe(1);
    expect(
      (await db.unmatchedValue.findUniqueOrThrow({ where: { id: unmatched.id } })).dismissedAt,
    ).toBeNull();
  });
});

// =============================================================================================
describe('sözlük kaydı: oluştur / güncelle / sil', () => {
  it('her tür oluşur; ad normalleştirilir, takma adlar tekilleşir; işlem kaydı yazılır (ad içermez)', async () => {
    const t = tag();
    const sector = await createDictionaryEntry(deps, system, {
      kind: 'SECTOR',
      name: `Yazılım ${t}`,
    });
    const company = await createDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      name: `Örnek ${t} A.Ş.`,
      aliases: [`Ornek ${t} Teknoloji`, `ORNEK ${t} teknoloji`, `Örnek ${t} A.Ş.`],
      sectorId: sector.id,
    });
    const row = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(row).toMatchObject({
      name: `Örnek ${t} A.Ş.`,
      normalizedName: `ornek ${t}`,
      aliases: [`ornek ${t} teknoloji`],
      sectorId: sector.id,
    });
    for (const kind of ['TITLE', 'SKILL'] as const) {
      const made = await createDictionaryEntry(deps, system, {
        kind,
        name: `Girdi ${t}`,
        aliases: [`Takma ${t}`],
      });
      expect(made.kind).toBe(kind);
    }
    const logs = await auditOf(company.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'DICTIONARY_CHANGE',
      targetType: 'DICTIONARY_ENTRY',
      actorId: system,
      metadata: { kind: 'COMPANY', change: 'CREATE', aliasCount: 1 },
    });
    expect(JSON.stringify(logs[0]!.metadata)).not.toContain(t);
  });

  it('aynı normalleştirilmiş ad ya da başka kaydın takma adıyla çakışma reddedilir ve hiçbir şey yazılmaz', async () => {
    const t = tag();
    const first = await createDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      name: `Birinci ${t}`,
      aliases: [`Eski Ad ${t}`],
    });
    const before = await db.company.count();
    await expectCode(
      createDictionaryEntry(deps, system, { kind: 'COMPANY', name: `BİRİNCİ ${t} Ltd. Şti.` }),
      'DICTIONARY_ENTRY_EXISTS',
    );
    await expectCode(
      createDictionaryEntry(deps, system, {
        kind: 'COMPANY',
        name: `Ikinci ${t}`,
        aliases: [`eski ad ${t}`],
      }),
      'DICTIONARY_ENTRY_EXISTS',
    );
    await expectCode(
      createDictionaryEntry(deps, system, { kind: 'COMPANY', name: `Eski Ad ${t}` }),
      'DICTIONARY_ENTRY_EXISTS',
    );
    expect(await db.company.count()).toBe(before);
    expect(await auditOf(first.id)).toHaveLength(1);
    // Aynı ad başka türde serbesttir.
    await expect(
      createDictionaryEntry(deps, system, { kind: 'TITLE', name: `Birinci ${t}` }),
    ).resolves.toBeDefined();
  });

  it('eşzamanlı aynı ad: biri başarılı, diğeri DICTIONARY_ENTRY_EXISTS', async () => {
    const name = `Yarış ${tag()}`;
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => createDictionaryEntry(deps, system, { kind: 'SKILL', name })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected')
        expect((r.reason as { code: string }).code).toBe('DICTIONARY_ENTRY_EXISTS');
    }
    expect(await db.skill.count({ where: { normalizedName: normalizeName(name, 'SKILL') } })).toBe(
      1,
    );
  });

  it('doğrulama: sektöre takma ad ya da şirket dışı türe sektör bağı; var olmayan sektör', async () => {
    const t = tag();
    await expect(
      createDictionaryEntry(deps, system, {
        kind: 'SECTOR',
        name: `Sektör ${t}`,
        aliases: ['x takma'],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_INVALID' });
    await expect(
      createDictionaryEntry(deps, system, {
        kind: 'TITLE',
        name: `Unvan ${t}`,
        sectorId: randomUUID(),
      }),
    ).rejects.toThrow();
    await expectCode(
      createDictionaryEntry(deps, system, {
        kind: 'COMPANY',
        name: `Şirket ${t}`,
        sectorId: randomUUID(),
      }),
      'RESOURCE_NOT_FOUND',
    );
    await expect(
      createDictionaryEntry(deps, system, { kind: 'TITLE', name: '..' }),
    ).rejects.toThrow();
  });

  it('güncelleme: ad, takma adlar, sektör bağı; var olmayan kayıt; çakışma; işlem kaydı', async () => {
    const t = tag();
    const sector = await createDictionaryEntry(deps, system, {
      kind: 'SECTOR',
      name: `Sektör ${t}`,
    });
    const other = await createDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      name: `Diğer ${t}`,
    });
    const company = await createDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      name: `Şirket ${t}`,
      aliases: [`Kısa ${t}`],
    });
    await updateDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      id: company.id,
      name: `Şirket ${t} Türkiye`,
      sectorId: sector.id,
    });
    let row = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(row).toMatchObject({
      name: `Şirket ${t} Türkiye`,
      normalizedName: `sirket ${t} turkiye`,
      aliases: [`kisa ${t}`],
      sectorId: sector.id,
    });
    await updateDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      id: company.id,
      aliases: [`Yeni ${t}`],
      sectorId: null,
    });
    row = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(row).toMatchObject({ aliases: [`yeni ${t}`], sectorId: null });

    await expectCode(
      updateDictionaryEntry(deps, system, { kind: 'COMPANY', id: company.id, name: `Diğer ${t}` }),
      'DICTIONARY_ENTRY_EXISTS',
    );
    await expectCode(
      updateDictionaryEntry(deps, system, {
        kind: 'COMPANY',
        id: company.id,
        aliases: [`diğer ${t}`],
      }),
      'DICTIONARY_ENTRY_EXISTS',
    );
    await expectCode(
      updateDictionaryEntry(deps, system, {
        kind: 'COMPANY',
        id: randomUUID(),
        name: 'Yok Şirket',
      }),
      'RESOURCE_NOT_FOUND',
    );
    await expectCode(
      updateDictionaryEntry(deps, system, {
        kind: 'COMPANY',
        id: company.id,
        sectorId: randomUUID(),
      }),
      'RESOURCE_NOT_FOUND',
    );
    // Başka türün kimliği bu türde bulunmaz.
    await expectCode(
      updateDictionaryEntry(deps, system, { kind: 'TITLE', id: company.id, name: 'Başka Unvan' }),
      'RESOURCE_NOT_FOUND',
    );
    // Kendi adını yeniden yazmak çakışma değildir.
    await expect(
      updateDictionaryEntry(deps, system, { kind: 'COMPANY', id: other.id, name: `Diğer ${t}` }),
    ).resolves.toBeDefined();
    const logs = await auditOf(company.id);
    expect(logs.map((log) => (log.metadata as { change: string }).change)).toEqual([
      'CREATE',
      'UPDATE',
      'UPDATE',
    ]);
  });

  it('ada göre yeniden adlandırma, takma adlardaki aynı değeri düşürür', async () => {
    const t = tag();
    const entry = await createDictionaryEntry(deps, system, {
      kind: 'TITLE',
      name: `Eski ${t}`,
      aliases: [`Yeni ${t}`],
    });
    await updateDictionaryEntry(deps, system, { kind: 'TITLE', id: entry.id, name: `Yeni ${t}` });
    expect(await db.title.findUniqueOrThrow({ where: { id: entry.id } })).toMatchObject({
      normalizedName: `yeni ${t}`,
      aliases: [],
    });
  });

  it('silme: gerekçe/onay zorunlu; kullanım sayısı kayda girer; bağlı kalemlerin bağı boşalır, ham metin kalır', async () => {
    const t = tag();
    const company = await createDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      name: `Silinecek ${t}`,
    });
    const userId = await createUser(db);
    const position = await db.position.create({
      data: {
        userId,
        companyId: company.id,
        companyRaw: `Silinecek ${t}`,
        titleRaw: 'Stajyer',
        source: 'MANUAL',
      },
    });
    await expect(
      deleteDictionaryEntry(deps, system, {
        kind: 'COMPANY',
        id: company.id,
        reason: REASON,
        confirmed: false as never,
      }),
    ).rejects.toThrow();
    await expect(
      deleteDictionaryEntry(deps, system, {
        kind: 'COMPANY',
        id: company.id,
        reason: 'x',
        confirmed: true,
      }),
    ).rejects.toThrow();
    await expectCode(
      deleteDictionaryEntry(deps, system, {
        kind: 'COMPANY',
        id: company.id,
        reason: 'Arayınız 0532 123 45 67',
        confirmed: true,
      }),
      'AUDIT_REASON_INVALID',
    );
    expect(await db.company.count({ where: { id: company.id } })).toBe(1);

    await deleteDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      id: company.id,
      reason: REASON,
      confirmed: true,
    });
    expect(await db.company.count({ where: { id: company.id } })).toBe(0);
    expect(await db.position.findUniqueOrThrow({ where: { id: position.id } })).toMatchObject({
      companyId: null,
      companyRaw: `Silinecek ${t}`,
    });
    const logs = await auditOf(company.id);
    expect(logs.at(-1)).toMatchObject({
      action: 'DICTIONARY_CHANGE',
      reason: REASON,
      metadata: { kind: 'COMPANY', change: 'DELETE', usageCount: 1 },
    });
    await expectCode(
      deleteDictionaryEntry(deps, system, {
        kind: 'COMPANY',
        id: company.id,
        reason: REASON,
        confirmed: true,
      }),
      'RESOURCE_NOT_FOUND',
    );
  });

  it('silinen kayda bağlı eşleşmeyen değerler kuyruğa geri döner; deneyimdeki şirket bağı temizlenir', async () => {
    const t = tag();
    const skill = await createDictionaryEntry(deps, system, { kind: 'SKILL', name: `Beceri ${t}` });
    const unmatched = await db.unmatchedValue.create({
      data: { kind: 'SKILL', rawValue: `x${t}`, normalizedValue: `x${t}`, resolvedToId: skill.id },
    });
    await deleteDictionaryEntry(deps, system, {
      kind: 'SKILL',
      id: skill.id,
      reason: REASON,
      confirmed: true,
    });
    const after = await db.unmatchedValue.findUniqueOrThrow({ where: { id: unmatched.id } });
    expect(after.resolvedToId).toBeNull();
    expect(after.dismissedAt).toBeNull();
  });

  it('sektör silinince şirket ve pozisyon sektör bağı boşalır', async () => {
    const t = tag();
    const sector = await createDictionaryEntry(deps, system, {
      kind: 'SECTOR',
      name: `Sektör ${t}`,
    });
    const company = await createDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      name: `Şirket ${t}`,
      sectorId: sector.id,
    });
    await deleteDictionaryEntry(deps, system, {
      kind: 'SECTOR',
      id: sector.id,
      reason: REASON,
      confirmed: true,
    });
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).sectorId).toBeNull();
  });
});

describe('listDictionaryEntries', () => {
  it('arama ad ve takma adda (normalleştirilmiş), tür başına; kullanım sayısı; sayfalama', async () => {
    const t = tag();
    const a = await createDictionaryEntry(deps, system, {
      kind: 'TITLE',
      name: `Veri Analisti ${t}`,
      aliases: [`Data Analyst ${t}`],
    });
    const b = await createDictionaryEntry(deps, system, { kind: 'TITLE', name: `Yazılım ${t}` });
    await createDictionaryEntry(deps, system, { kind: 'SKILL', name: `Veri Analisti ${t}` });
    const userId = await createUser(db);
    await db.position.createMany({
      data: [
        { userId, titleId: a.id, titleRaw: 'x', companyRaw: 'y', source: 'MANUAL' },
        { userId, titleId: a.id, titleRaw: 'x', companyRaw: 'z', source: 'MANUAL' },
      ],
    });
    const byName = await listDictionaryEntries(deps, system, {
      kind: 'TITLE',
      query: `VERİ analisti ${t}`,
    });
    expect(byName.items.map((item) => item.id)).toEqual([a.id]);
    expect(byName.items[0]).toMatchObject({
      kind: 'TITLE',
      usageCount: 2,
      aliases: [`data analyst ${t}`],
      sectorId: null,
    });
    const byAlias = await listDictionaryEntries(deps, system, {
      kind: 'TITLE',
      query: `data analyst ${t}`,
    });
    expect(byAlias.items.map((item) => item.id)).toEqual([a.id]);
    const both = await listDictionaryEntries(deps, system, { kind: 'TITLE', query: t });
    expect(both.items.map((item) => item.id).sort()).toEqual([a.id, b.id].sort());
    expect(
      (await listDictionaryEntries(deps, system, { kind: 'SKILL', query: t })).items.every(
        (item) => item.kind === 'SKILL',
      ),
    ).toBe(true);
    const first = await listDictionaryEntries(deps, system, { kind: 'TITLE', query: t, limit: 1 });
    const second = await listDictionaryEntries(deps, system, {
      kind: 'TITLE',
      query: t,
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(new Set([...first.items, ...second.items].map((item) => item.id))).toEqual(
      new Set([a.id, b.id]),
    );
  });

  it('şirket satırı sektör adını taşır', async () => {
    const t = tag();
    const sector = await createDictionaryEntry(deps, system, {
      kind: 'SECTOR',
      name: `Finans ${t}`,
    });
    await createDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      name: `Banka ${t}`,
      sectorId: sector.id,
    });
    const item = (
      await listDictionaryEntries(deps, system, { kind: 'COMPANY', query: `banka ${t}` })
    ).items[0]!;
    expect(item).toMatchObject({ sectorId: sector.id, sectorName: `Finans ${t}` });
  });
});

// =============================================================================================
describe('eşleşmeyen değerler', () => {
  async function seed(kind: 'COMPANY' | 'TITLE' | 'SKILL' | 'SECTOR', raw: string, times = 1) {
    for (let index = 0; index < times; index += 1) {
      await db.$transaction((tx) => recordUnmatched(tx, kind as 'COMPANY', raw));
    }
    return db.unmatchedValue.findUniqueOrThrow({
      where: { kind_normalizedValue: { kind, normalizedValue: normalizeName(raw, kind) } },
    });
  }

  it('liste: durum süzgeci, tür süzgeci, en çok görülen önce, benzer kayıt ipuçları', async () => {
    const t = tag();
    const known = await createDictionaryEntry(deps, system, {
      kind: 'COMPANY',
      name: `Teknoloji ${t} Holding`,
    });
    const frequent = await seed('COMPANY', `Teknoloji ${t} Holdng`, 3);
    const rare = await seed('COMPANY', `Rastgele Ad ${t}`, 1);
    const page = await listUnmatchedValues(deps, system, { kind: 'COMPANY', limit: 50 });
    const ids = page.items.map((item) => item.id);
    expect(ids.indexOf(frequent.id)).toBeLessThan(ids.indexOf(rare.id));
    const item = page.items.find((candidate) => candidate.id === frequent.id)!;
    expect(item).toMatchObject({ status: 'OPEN', count: 3, resolvedTo: null });
    expect(item.suggestions.map((suggestion) => suggestion.id)).toContain(known.id);
    expect(item.suggestions.length).toBeLessThanOrEqual(3);
    expect(page.items.every((candidate) => candidate.kind === 'COMPANY')).toBe(true);
    // Çözülmüş/atılmış olanlar açık listede yok.
    await resolveUnmatchedValue(deps, system, {
      id: rare.id,
      resolution: { type: 'DISMISS', reason: REASON, confirmed: true },
    });
    const open = (
      await listUnmatchedValues(deps, system, { kind: 'COMPANY', limit: 50 })
    ).items.map((i) => i.id);
    expect(open).not.toContain(rare.id);
    const dismissed = await listUnmatchedValues(deps, system, {
      kind: 'COMPANY',
      status: 'DISMISSED',
      limit: 50,
    });
    expect(dismissed.items.find((i) => i.id === rare.id)?.status).toBe('DISMISSED');
  });

  it('sayfalama: sayaç sırası korunur, hiçbir satır atlanmaz ya da tekrarlanmaz', async () => {
    const t = tag();
    const rows = [];
    for (let index = 0; index < 5; index += 1)
      rows.push(await seed('TITLE', `Sayfa ${t} ${index}`, (index % 3) + 1));
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let round = 0; round < 40; round += 1) {
      const page = await listUnmatchedValues(deps, system, {
        kind: 'TITLE',
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...page.items.map((item) => item.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    for (const row of rows) expect(seen).toContain(row.id);
  });

  it('LINK: değer mevcut kaydın takma adı olur, profil kalemi bağlanır, işlem kaydı yazılır; eşleme artık bulur', async () => {
    const t = tag();
    const title = await createDictionaryEntry(deps, system, {
      kind: 'TITLE',
      name: `Yazılım Mühendisi ${t}`,
    });
    const unmatched = await seed('TITLE', `SW Engineer ${t}`, 2);
    const userId = await createUser(db);
    const position = await db.position.create({
      data: { userId, titleRaw: `sw engineer ${t}`, companyRaw: 'Bir Yer', source: 'CV' },
    });
    const untouched = await db.position.create({
      data: { userId, titleRaw: `başka unvan ${t}`, companyRaw: 'Bir Yer', source: 'CV' },
    });
    const result = await resolveUnmatchedValue(deps, system, {
      id: unmatched.id,
      resolution: { type: 'LINK', entryId: title.id },
    });
    expect(result).toEqual({ id: unmatched.id, status: 'RESOLVED', entryId: title.id });
    expect((await db.title.findUniqueOrThrow({ where: { id: title.id } })).aliases).toContain(
      `sw engineer ${t}`,
    );
    expect((await db.position.findUniqueOrThrow({ where: { id: position.id } })).titleId).toBe(
      title.id,
    );
    expect(
      (await db.position.findUniqueOrThrow({ where: { id: untouched.id } })).titleId,
    ).toBeNull();
    const logs = await auditOf(unmatched.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'UNMATCHED_RESOLVE',
      targetType: 'UNMATCHED_VALUE',
      metadata: { kind: 'TITLE', resolution: 'LINK', entryId: title.id, seenCount: 2, relinked: 1 },
    });
    const resolved = await listUnmatchedValues(deps, system, {
      kind: 'TITLE',
      status: 'RESOLVED',
      limit: 50,
    });
    expect(resolved.items.find((i) => i.id === unmatched.id)?.resolvedTo).toEqual({
      id: title.id,
      name: `Yazılım Mühendisi ${t}`,
    });
    // Aynı değer yeniden gelirse sayaç artar, kuyruk yeniden AÇILMAZ.
    await seed('TITLE', `SW Engineer ${t}`, 1);
    const again = await db.unmatchedValue.findUniqueOrThrow({ where: { id: unmatched.id } });
    expect(again.count).toBe(3);
    expect(again.resolvedToId).toBe(title.id);
  });

  it('LINK beceri: ProfileTag bağı kurulur; sektöre LINK geçersiz; var olmayan kayıt RESOURCE_NOT_FOUND', async () => {
    const t = tag();
    const skill = await createDictionaryEntry(deps, system, { kind: 'SKILL', name: `Python ${t}` });
    const unmatched = await seed('SKILL', `Pyton ${t}`);
    const userId = await createUser(db);
    const profile = await db.profile.create({ data: { userId } });
    const personal = await db.tag.create({
      data: {
        kind: 'SKILL',
        slug: normalizeName(`Pyton ${t}`, 'SKILL'),
        label: `Pyton ${t}`,
        curated: false,
      },
    });
    await db.profileTag.create({ data: { profileId: profile.id, tagId: personal.id } });
    await resolveUnmatchedValue(deps, system, {
      id: unmatched.id,
      resolution: { type: 'LINK', entryId: skill.id },
    });
    const links = await db.profileTag.findMany({
      where: { profileId: profile.id },
      select: { tag: { select: { label: true, curated: true } } },
    });
    expect(links).toEqual([{ tag: { label: `Python ${t}`, curated: true } }]);

    const sectorValue = await seed('SECTOR', `Sektör ${t}`);
    const sector = await createDictionaryEntry(deps, system, {
      kind: 'SECTOR',
      name: `Gerçek Sektör ${t}`,
    });
    await expectCode(
      resolveUnmatchedValue(deps, system, {
        id: sectorValue.id,
        resolution: { type: 'LINK', entryId: sector.id },
      }),
      'VALIDATION_INVALID',
    );
    const company = await seed('COMPANY', `Şirket ${t}`);
    await expectCode(
      resolveUnmatchedValue(deps, system, {
        id: company.id,
        resolution: { type: 'LINK', entryId: randomUUID() },
      }),
      'RESOURCE_NOT_FOUND',
    );
    expect(
      (await db.unmatchedValue.findUniqueOrThrow({ where: { id: company.id } })).resolvedToId,
    ).toBeNull();
  });

  it('CREATE: yeni kayıt açılır, değer ona bağlanır ve takma ad olur; eşleşen kalemler bağlanır', async () => {
    const t = tag();
    const sector = await createDictionaryEntry(deps, system, {
      kind: 'SECTOR',
      name: `Sektör ${t}`,
    });
    const unmatched = await seed('COMPANY', `Yeni Girişim ${t} Teknoloji`, 2);
    const userId = await createUser(db);
    const position = await db.position.create({
      data: {
        userId,
        companyRaw: `yeni girişim ${t} teknoloji`,
        titleRaw: 'Stajyer',
        source: 'CV',
      },
    });
    const result = await resolveUnmatchedValue(deps, system, {
      id: unmatched.id,
      resolution: { type: 'CREATE', name: `Yeni Girişim ${t}`, aliases: [], sectorId: sector.id },
    });
    expect(result.status).toBe('RESOLVED');
    const created = await db.company.findUniqueOrThrow({ where: { id: result.entryId! } });
    expect(created).toMatchObject({
      name: `Yeni Girişim ${t}`,
      normalizedName: `yeni girisim ${t}`,
      sectorId: sector.id,
    });
    expect(created.aliases).toContain(`yeni girisim ${t} teknoloji`);
    expect((await db.position.findUniqueOrThrow({ where: { id: position.id } })).companyId).toBe(
      created.id,
    );
    const log = (await auditOf(unmatched.id))[0]!;
    expect(log.metadata).toMatchObject({ resolution: 'CREATE', entryId: created.id });
    expect(JSON.stringify(log.metadata)).not.toContain(t);
  });

  it('CREATE çakışması hiçbir şey yazmaz; sektör bağı yalnız şirkette', async () => {
    const t = tag();
    await createDictionaryEntry(deps, system, { kind: 'TITLE', name: `Mevcut ${t}` });
    const unmatched = await seed('TITLE', `Mevcudd ${t}`);
    await expectCode(
      resolveUnmatchedValue(deps, system, {
        id: unmatched.id,
        resolution: { type: 'CREATE', name: `MEVCUT ${t}`, aliases: [] },
      }),
      'DICTIONARY_ENTRY_EXISTS',
    );
    await expectCode(
      resolveUnmatchedValue(deps, system, {
        id: unmatched.id,
        resolution: { type: 'CREATE', name: `Başka ${t}`, aliases: [], sectorId: randomUUID() },
      }),
      'VALIDATION_INVALID',
    );
    const row = await db.unmatchedValue.findUniqueOrThrow({ where: { id: unmatched.id } });
    expect(row.resolvedToId).toBeNull();
    expect(await db.title.count({ where: { normalizedName: `baska ${t}` } })).toBe(0);
    expect(await auditOf(unmatched.id)).toHaveLength(0);
  });

  it('DISMISS: gerekçe + onay zorunlu, işlem kaydı gerekçeyle; ikinci çözüm UNMATCHED_NOT_OPEN; olmayan değer RESOURCE_NOT_FOUND', async () => {
    const t = tag();
    const unmatched = await seed('SKILL', `Anlamsız ${t}`);
    await expect(
      resolveUnmatchedValue(deps, system, {
        id: unmatched.id,
        resolution: { type: 'DISMISS', reason: REASON, confirmed: false as never },
      }),
    ).rejects.toThrow();
    await expect(
      resolveUnmatchedValue(deps, system, {
        id: unmatched.id,
        resolution: { type: 'DISMISS', reason: 'ab', confirmed: true },
      }),
    ).rejects.toThrow();
    await expectCode(
      resolveUnmatchedValue(deps, system, {
        id: unmatched.id,
        resolution: { type: 'DISMISS', reason: 'ayse@ornek.com yazdı', confirmed: true },
      }),
      'AUDIT_REASON_INVALID',
    );
    expect(
      (await db.unmatchedValue.findUniqueOrThrow({ where: { id: unmatched.id } })).dismissedAt,
    ).toBeNull();

    const now = new Date('2030-01-01T00:00:00Z');
    const result = await resolveUnmatchedValue({ db, now: () => now }, system, {
      id: unmatched.id,
      resolution: { type: 'DISMISS', reason: REASON, confirmed: true },
    });
    expect(result).toEqual({ id: unmatched.id, status: 'DISMISSED', entryId: null });
    expect(
      (await db.unmatchedValue.findUniqueOrThrow({ where: { id: unmatched.id } })).dismissedAt,
    ).toEqual(now);
    expect((await auditOf(unmatched.id))[0]).toMatchObject({
      action: 'UNMATCHED_RESOLVE',
      reason: REASON,
    });
    await expectCode(
      resolveUnmatchedValue(deps, system, {
        id: unmatched.id,
        resolution: { type: 'DISMISS', reason: REASON, confirmed: true },
      }),
      'UNMATCHED_NOT_OPEN',
    );
    await expectCode(
      resolveUnmatchedValue(deps, system, {
        id: randomUUID(),
        resolution: { type: 'DISMISS', reason: REASON, confirmed: true },
      }),
      'RESOURCE_NOT_FOUND',
    );
  });

  it('eşzamanlı çözüm: biri başarılı, diğerleri UNMATCHED_NOT_OPEN; tek işlem kaydı', async () => {
    const t = tag();
    const unmatched = await seed('SKILL', `Yarış ${t}`);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        resolveUnmatchedValue(deps, system, {
          id: unmatched.id,
          resolution: { type: 'CREATE', name: `Yarış Beceri ${t}`, aliases: [] },
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(['UNMATCHED_NOT_OPEN', 'DICTIONARY_ENTRY_EXISTS']).toContain(
          (r.reason as { code: string }).code,
        );
      }
    }
    expect(await auditOf(unmatched.id)).toHaveLength(1);
  });

  it('genel bakışta açık eşleşmeyen sayısı çözüldükçe düşer', async () => {
    const t = tag();
    const before = (await getAdminOverview(deps, system)).counts.openUnmatchedValues!;
    const row = await seed('SKILL', `Sayaç ${t}`);
    expect((await getAdminOverview(deps, system)).counts.openUnmatchedValues).toBe(before + 1);
    await resolveUnmatchedValue(deps, system, {
      id: row.id,
      resolution: { type: 'DISMISS', reason: REASON, confirmed: true },
    });
    expect((await getAdminOverview(deps, system)).counts.openUnmatchedValues).toBe(before);
  });
});

describe('veritabanı kısıtı', () => {
  it('bir değer hem çözülmüş hem atılmış olamaz', async () => {
    const t = tag();
    await expect(
      db.unmatchedValue.create({
        data: {
          kind: 'SKILL',
          rawValue: t,
          normalizedValue: t,
          resolvedToId: randomUUID(),
          dismissedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/UnmatchedValue_state_check/);
  });
});

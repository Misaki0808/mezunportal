import 'server-only';

import {
  createDictionaryEntrySchema,
  deleteDictionaryEntrySchema,
  dictionaryEntryIdOutputSchema,
  dictionaryEntryPageSchema,
  listDictionaryEntriesSchema,
  listUnmatchedValuesSchema,
  resolveUnmatchedValueOutputSchema,
  resolveUnmatchedValueSchema,
  unmatchedValuePageSchema,
  updateDictionaryEntrySchema,
  type CreateDictionaryEntryInput,
  type DeleteDictionaryEntryInput,
  type DictionaryEntryIdOutput,
  type DictionaryEntryPage,
  type DictionaryKind,
  type ListDictionaryEntriesInput,
  type ListUnmatchedValuesInput,
  type ResolveUnmatchedValueInput,
  type ResolveUnmatchedValueOutput,
  type UnmatchedValuePage,
  type UpdateDictionaryEntryInput,
} from '@/contracts/admin';
import { Prisma } from '@/generated/prisma/client';
import { codedConflict, codedNotFound, codedValidation } from '@/lib/errors';

import { findReasonProblem } from '../rules/adminAudit';
import { DICTIONARY_MATCH_THRESHOLD, normalizeName } from '../rules/dictionary';
import {
  idCursorWhere,
  loadSystemAdmin,
  nowOf,
  readAsAdmin,
  toPage,
  TX_OPTIONS,
  type AdminDeps,
  type Tx,
} from './admin-access';
import { openUnmatchedWhere } from './admin-panel';
import { recordAdminAction } from './audit';

/**
 * Sözlük yönetimi ve eşleşmeyen değerler (P1-11; yalnız SİSTEM yöneticisi). Her değişiklik `DICTIONARY_CHANGE` /
 * `UNMATCHED_RESOLVE` işlem kaydıyla AYNI işlemde yazılır. Kayıt metadata'sına ad girmez (yalnız tür, kimlik, sayı).
 * Takma adlar `normalizeName` ile saklanır; aynı türde başka bir kaydın adı ya da takma adıyla çakışan ad/takma ad
 * reddedilir (`DICTIONARY_ENTRY_EXISTS`): eşleme tek anlamlı kalır.
 */

type Row = {
  id: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  sectorId: string | null;
  sectorName: string | null;
};

const HAS_ALIASES = (kind: DictionaryKind) => kind !== 'SECTOR';

// ---------------------------------------------------------------------------------------------
// Tür başına sorgu bağdaştırıcısı
// ---------------------------------------------------------------------------------------------

async function findRows(
  tx: Tx,
  kind: DictionaryKind,
  options: { ids?: string[]; query?: string; cursor?: string; take?: number },
): Promise<Row[]> {
  const base = {
    ...(options.ids ? { id: { in: options.ids } } : {}),
    ...idCursorWhere(options.cursor),
  };
  const needle = options.query ? normalizeName(options.query, kind) : '';
  const textWhere = (aliases: boolean) =>
    needle === ''
      ? {}
      : {
          OR: [
            { normalizedName: { contains: needle } },
            ...(aliases ? [{ aliases: { has: needle } }] : []),
          ],
        };
  const args = {
    orderBy: { id: 'desc' as const },
    ...(options.take ? { take: options.take } : {}),
  };
  switch (kind) {
    case 'COMPANY': {
      const rows = await tx.company.findMany({
        where: { ...base, ...textWhere(true) },
        include: { sector: { select: { name: true } } },
        ...args,
      });
      return rows.map((row) => ({ ...row, sectorName: row.sector?.name ?? null }));
    }
    case 'TITLE':
      return (await tx.title.findMany({ where: { ...base, ...textWhere(true) }, ...args })).map(
        (row) => ({ ...row, sectorId: null, sectorName: null }),
      );
    case 'SKILL':
      return (await tx.skill.findMany({ where: { ...base, ...textWhere(true) }, ...args })).map(
        (row) => ({ ...row, sectorId: null, sectorName: null }),
      );
    case 'SECTOR':
      return (await tx.sector.findMany({ where: { ...base, ...textWhere(false) }, ...args })).map(
        (row) => ({ ...row, aliases: [], sectorId: null, sectorName: null }),
      );
  }
}

/** Kaydı kullanan profil kalemi sayısı (silmeden önce uyarı için). */
async function usageCounts(
  tx: Tx,
  kind: DictionaryKind,
  ids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const add = (key: string | null, n: number) => {
    if (key !== null) counts.set(key, (counts.get(key) ?? 0) + n);
  };
  switch (kind) {
    case 'COMPANY': {
      for (const group of await tx.position.groupBy({
        by: ['companyId'],
        where: { companyId: { in: ids } },
        _count: { _all: true },
      }))
        add(group.companyId, group._count._all);
      for (const group of await tx.experience.groupBy({
        by: ['companyId'],
        where: { companyId: { in: ids } },
        _count: { _all: true },
      }))
        add(group.companyId, group._count._all);
      break;
    }
    case 'TITLE':
      for (const group of await tx.position.groupBy({
        by: ['titleId'],
        where: { titleId: { in: ids } },
        _count: { _all: true },
      }))
        add(group.titleId, group._count._all);
      break;
    case 'SKILL':
      for (const group of await tx.userSkill.groupBy({
        by: ['skillId'],
        where: { skillId: { in: ids } },
        _count: { _all: true },
      }))
        add(group.skillId, group._count._all);
      break;
    case 'SECTOR':
      for (const group of await tx.position.groupBy({
        by: ['sectorId'],
        where: { sectorId: { in: ids } },
        _count: { _all: true },
      }))
        add(group.sectorId, group._count._all);
      for (const group of await tx.company.groupBy({
        by: ['sectorId'],
        where: { sectorId: { in: ids } },
        _count: { _all: true },
      }))
        add(group.sectorId, group._count._all);
      break;
  }
  return counts;
}

/** Tür başına yazma serileştirilir: ad/takma ad çakışma denetimi yarış altında da doğru kalır. */
async function lockKind(tx: Tx, kind: DictionaryKind) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dictionary:${kind}`}))`;
}

function normalizeAliases(
  kind: DictionaryKind,
  aliases: readonly string[],
  ownName: string,
): string[] {
  if (!HAS_ALIASES(kind)) {
    if (aliases.length > 0) throw codedValidation('VALIDATION_INVALID');
    return [];
  }
  const out = new Set<string>();
  for (const alias of aliases) {
    const normalized = normalizeName(alias, kind);
    if (normalized !== '' && normalized !== ownName) out.add(normalized);
  }
  return [...out];
}

/** Ad ya da takma adlardan biri, AYNI türde başka bir kaydın adı/takma adıysa çakışır. */
async function assertNoCollision(
  tx: Tx,
  kind: DictionaryKind,
  names: string[],
  exceptId: string | null,
) {
  const exclude = exceptId ? { id: { not: exceptId } } : {};
  const aliasMatch = HAS_ALIASES(kind) ? [{ aliases: { hasSome: names } }] : [];
  const where = { ...exclude, OR: [{ normalizedName: { in: names } }, ...aliasMatch] };
  const found =
    kind === 'COMPANY'
      ? await tx.company.count({ where })
      : kind === 'TITLE'
        ? await tx.title.count({ where })
        : kind === 'SKILL'
          ? await tx.skill.count({ where })
          : await tx.sector.count({ where: { ...exclude, normalizedName: { in: names } } });
  if (found > 0) throw codedConflict('DICTIONARY_ENTRY_EXISTS');
}

async function assertSectorExists(tx: Tx, sectorId: string) {
  if ((await tx.sector.count({ where: { id: sectorId } })) === 0) {
    throw codedNotFound('RESOURCE_NOT_FOUND');
  }
}

function mapUnique(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw codedConflict('DICTIONARY_ENTRY_EXISTS');
  }
  throw error;
}

// ---------------------------------------------------------------------------------------------
// Sözlük kayıtları
// ---------------------------------------------------------------------------------------------

export async function listDictionaryEntries(
  deps: AdminDeps,
  adminUserId: string,
  input: ListDictionaryEntriesInput,
): Promise<DictionaryEntryPage> {
  const parsed = listDictionaryEntriesSchema.parse(input);
  return readAsAdmin(deps, adminUserId, 'SYSTEM_ONLY', async ({ tx }) => {
    const rows = await findRows(tx, parsed.kind, {
      query: parsed.query,
      cursor: parsed.cursor,
      take: parsed.limit + 1,
    });
    const result = toPage(rows, parsed.limit);
    const usage = await usageCounts(
      tx,
      parsed.kind,
      result.items.map((row) => row.id),
    );
    return dictionaryEntryPageSchema.parse({
      items: result.items.map((row) => ({
        id: row.id,
        kind: parsed.kind,
        name: row.name,
        aliases: row.aliases,
        sectorId: row.sectorId,
        sectorName: row.sectorName,
        usageCount: usage.get(row.id) ?? 0,
      })),
      nextCursor: result.nextCursor,
    });
  });
}

export async function createDictionaryEntry(
  deps: AdminDeps,
  adminUserId: string,
  input: CreateDictionaryEntryInput,
): Promise<DictionaryEntryIdOutput> {
  const parsed = createDictionaryEntrySchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadSystemAdmin(tx, adminUserId, now);
    const normalizedName = normalizeName(parsed.name, parsed.kind);
    if (normalizedName === '') throw codedValidation('VALIDATION_INVALID');
    const aliases = normalizeAliases(parsed.kind, parsed.aliases, normalizedName);
    await lockKind(tx, parsed.kind);
    await assertNoCollision(tx, parsed.kind, [normalizedName, ...aliases], null);
    if (parsed.sectorId !== undefined) await assertSectorExists(tx, parsed.sectorId);
    const name = parsed.name.trim();
    let id: string;
    try {
      id = await insertEntry(tx, parsed.kind, {
        name,
        normalizedName,
        aliases,
        sectorId: parsed.sectorId ?? null,
      });
    } catch (error) {
      mapUnique(error);
    }
    await recordAdminAction(tx, {
      actor,
      action: 'DICTIONARY_CHANGE',
      targetType: 'DICTIONARY_ENTRY',
      targetId: id,
      metadata: { kind: parsed.kind, change: 'CREATE', aliasCount: aliases.length },
    });
    return dictionaryEntryIdOutputSchema.parse({ kind: parsed.kind, id });
  }, TX_OPTIONS);
}

async function insertEntry(
  tx: Tx,
  kind: DictionaryKind,
  data: { name: string; normalizedName: string; aliases: string[]; sectorId: string | null },
): Promise<string> {
  const select = { id: true };
  switch (kind) {
    case 'COMPANY':
      return (await tx.company.create({ data, select })).id;
    case 'TITLE':
      return (
        await tx.title.create({
          data: { name: data.name, normalizedName: data.normalizedName, aliases: data.aliases },
          select,
        })
      ).id;
    case 'SKILL':
      return (
        await tx.skill.create({
          data: { name: data.name, normalizedName: data.normalizedName, aliases: data.aliases },
          select,
        })
      ).id;
    case 'SECTOR':
      return (
        await tx.sector.create({
          data: { name: data.name, normalizedName: data.normalizedName },
          select,
        })
      ).id;
  }
}

export async function updateDictionaryEntry(
  deps: AdminDeps,
  adminUserId: string,
  input: UpdateDictionaryEntryInput,
): Promise<DictionaryEntryIdOutput> {
  const parsed = updateDictionaryEntrySchema.parse(input);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadSystemAdmin(tx, adminUserId, now);
    await lockKind(tx, parsed.kind);
    const [current] = await findRows(tx, parsed.kind, { ids: [parsed.id], take: 1 });
    if (!current) throw codedNotFound('RESOURCE_NOT_FOUND');

    const normalizedName =
      parsed.name === undefined ? current.normalizedName : normalizeName(parsed.name, parsed.kind);
    if (normalizedName === '') throw codedValidation('VALIDATION_INVALID');
    const aliases =
      parsed.aliases === undefined
        ? current.aliases.filter((alias) => alias !== normalizedName)
        : normalizeAliases(parsed.kind, parsed.aliases, normalizedName);
    await assertNoCollision(tx, parsed.kind, [normalizedName, ...aliases], parsed.id);
    if (typeof parsed.sectorId === 'string') await assertSectorExists(tx, parsed.sectorId);

    try {
      await writeEntry(tx, parsed.kind, parsed.id, {
        ...(parsed.name === undefined ? {} : { name: parsed.name.trim(), normalizedName }),
        aliases,
        ...(parsed.sectorId === undefined ? {} : { sectorId: parsed.sectorId }),
      });
    } catch (error) {
      mapUnique(error);
    }
    await recordAdminAction(tx, {
      actor,
      action: 'DICTIONARY_CHANGE',
      targetType: 'DICTIONARY_ENTRY',
      targetId: parsed.id,
      metadata: {
        kind: parsed.kind,
        change: 'UPDATE',
        renamed: parsed.name !== undefined,
        aliasCount: aliases.length,
      },
    });
    return dictionaryEntryIdOutputSchema.parse({ kind: parsed.kind, id: parsed.id });
  }, TX_OPTIONS);
}

async function writeEntry(
  tx: Tx,
  kind: DictionaryKind,
  id: string,
  data: { name?: string; normalizedName?: string; aliases: string[]; sectorId?: string | null },
) {
  const { aliases, sectorId, ...names } = data;
  switch (kind) {
    case 'COMPANY':
      await tx.company.update({
        where: { id },
        data: { ...names, aliases, ...(sectorId === undefined ? {} : { sectorId }) },
      });
      return;
    case 'TITLE':
      await tx.title.update({ where: { id }, data: { ...names, aliases } });
      return;
    case 'SKILL':
      await tx.skill.update({ where: { id }, data: { ...names, aliases } });
      return;
    case 'SECTOR':
      await tx.sector.update({ where: { id }, data: names });
      return;
  }
}

export async function deleteDictionaryEntry(
  deps: AdminDeps,
  adminUserId: string,
  input: DeleteDictionaryEntryInput,
): Promise<DictionaryEntryIdOutput> {
  const parsed = deleteDictionaryEntrySchema.parse(input);
  // Gerekçe kişisel veri içermemeli: yazmadan önce doğrulanır.
  const problem = findReasonProblem('DICTIONARY_CHANGE', parsed.reason);
  if (problem === 'INVALID') throw codedValidation('AUDIT_REASON_INVALID');
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadSystemAdmin(tx, adminUserId, now);
    await lockKind(tx, parsed.kind);
    const [current] = await findRows(tx, parsed.kind, { ids: [parsed.id], take: 1 });
    if (!current) throw codedNotFound('RESOURCE_NOT_FOUND');
    const usage = (await usageCounts(tx, parsed.kind, [parsed.id])).get(parsed.id) ?? 0;

    // Bağlı profil kalemlerinin sözlük bağı boşalır (FK `SetNull`), ham metinleri kalır.
    if (parsed.kind === 'COMPANY') {
      // Deneyimdeki şirket bağı FK değildir; `updatedAt` kayması olmasın diye doğrudan temizlenir.
      await tx.$executeRaw`UPDATE "Experience" SET "companyId" = NULL WHERE "companyId" = ${parsed.id}`;
    }
    // Bu kayda bağlanmış eşleşmeyen değerler yeniden kuyruğa döner.
    await tx.unmatchedValue.updateMany({
      where: { kind: parsed.kind, resolvedToId: parsed.id },
      data: { resolvedToId: null },
    });
    await deleteEntry(tx, parsed.kind, parsed.id);
    await recordAdminAction(tx, {
      actor,
      action: 'DICTIONARY_CHANGE',
      targetType: 'DICTIONARY_ENTRY',
      targetId: parsed.id,
      reason: parsed.reason,
      metadata: { kind: parsed.kind, change: 'DELETE', usageCount: usage },
    });
    return dictionaryEntryIdOutputSchema.parse({ kind: parsed.kind, id: parsed.id });
  }, TX_OPTIONS);
}

async function deleteEntry(tx: Tx, kind: DictionaryKind, id: string) {
  switch (kind) {
    case 'COMPANY':
      await tx.company.delete({ where: { id } });
      return;
    case 'TITLE':
      await tx.title.delete({ where: { id } });
      return;
    case 'SKILL':
      await tx.skill.delete({ where: { id } });
      return;
    case 'SECTOR':
      await tx.sector.delete({ where: { id } });
      return;
  }
}

// ---------------------------------------------------------------------------------------------
// Eşleşmeyen değerler
// ---------------------------------------------------------------------------------------------

const TABLE_BY_KIND: Record<DictionaryKind, Prisma.Sql> = {
  COMPANY: Prisma.raw('"Company"'),
  TITLE: Prisma.raw('"Title"'),
  SKILL: Prisma.raw('"Skill"'),
  SECTOR: Prisma.raw('"Sector"'),
};

type UnmatchedStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';
const statusOf = (row: {
  resolvedToId: string | null;
  dismissedAt: Date | null;
}): UnmatchedStatus =>
  row.dismissedAt !== null ? 'DISMISSED' : row.resolvedToId !== null ? 'RESOLVED' : 'OPEN';

const statusWhere = (status: UnmatchedStatus): Prisma.UnmatchedValueWhereInput =>
  status === 'OPEN'
    ? openUnmatchedWhere
    : status === 'RESOLVED'
      ? { resolvedToId: { not: null } }
      : { dismissedAt: { not: null } };

/** En benzer sözlük kayıtları (karar ipucu; en fazla 3). Tablo adı yalnız sabit eşlemeden gelir. */
async function suggestEntries(tx: Tx, kind: DictionaryKind, normalizedValue: string) {
  return tx.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT "id", "name" FROM ${TABLE_BY_KIND[kind]}
    WHERE similarity("normalizedName", ${normalizedValue}) >= ${DICTIONARY_MATCH_THRESHOLD - 0.25}
    ORDER BY similarity("normalizedName", ${normalizedValue}) DESC, "normalizedName" ASC
    LIMIT 3`);
}

export async function listUnmatchedValues(
  deps: AdminDeps,
  adminUserId: string,
  input: ListUnmatchedValuesInput,
): Promise<UnmatchedValuePage> {
  const parsed = listUnmatchedValuesSchema.parse(input);
  return readAsAdmin(deps, adminUserId, 'SYSTEM_ONLY', async ({ tx }) => {
    // Sıra: en çok görülen önce, eşitte yeni önce. İmleç kimliktir; sıra anahtarı imleç satırından okunur.
    let after: Prisma.UnmatchedValueWhereInput = {};
    if (parsed.cursor) {
      const anchor = await tx.unmatchedValue.findUnique({
        where: { id: parsed.cursor },
        select: { count: true },
      });
      if (anchor) {
        after = {
          OR: [{ count: { lt: anchor.count } }, { count: anchor.count, id: { lt: parsed.cursor } }],
        };
      }
    }
    const rows = await tx.unmatchedValue.findMany({
      where: {
        AND: [statusWhere(parsed.status), after, parsed.kind ? { kind: parsed.kind } : {}],
      },
      orderBy: [{ count: 'desc' }, { id: 'desc' }],
      take: parsed.limit + 1,
    });
    const result = toPage(rows, parsed.limit);

    const items = [];
    for (const row of result.items) {
      const status = statusOf(row);
      let resolvedTo: { id: string; name: string } | null = null;
      if (row.resolvedToId) {
        const [entry] = await findRows(tx, row.kind, { ids: [row.resolvedToId], take: 1 });
        resolvedTo = entry ? { id: entry.id, name: entry.name } : null;
      }
      items.push({
        id: row.id,
        kind: row.kind,
        rawValue: row.rawValue,
        normalizedValue: row.normalizedValue,
        count: row.count,
        status,
        resolvedTo,
        suggestions:
          status === 'OPEN' ? await suggestEntries(tx, row.kind, row.normalizedValue) : [],
      });
    }
    return unmatchedValuePageSchema.parse({ items, nextCursor: result.nextCursor });
  });
}

/** Her çözümde taranacak en fazla boş-bağlı pozisyon sayısı (pilot ölçeği; aşılırsa kalanı sonraki CV ile bağlanır). */
const RELINK_SCAN_LIMIT = 5000;

/**
 * Çözülen değere denk gelen, sözlük bağı boş profil kalemlerini bağlar. Kalem metni değişmez (yalnız bağ);
 * bu yüzden elle düzeltilmiş kalem de bağlanır. Bağlanan kalem sayısını döner.
 */
async function relinkProfileItems(
  tx: Tx,
  kind: DictionaryKind,
  entryId: string,
  normalizedValue: string,
): Promise<number> {
  if (kind === 'SKILL') {
    const result = await tx.userSkill.updateMany({
      where: { skillId: null, normalizedName: normalizedValue },
      data: { skillId: entryId },
    });
    return result.count;
  }
  if (kind !== 'COMPANY' && kind !== 'TITLE') return 0;
  const rawField = kind === 'COMPANY' ? 'companyRaw' : 'titleRaw';
  const linkField = kind === 'COMPANY' ? 'companyId' : 'titleId';
  const rows = await tx.position.findMany({
    where: { [linkField]: null },
    select: { id: true, companyRaw: true, titleRaw: true },
    orderBy: { id: 'desc' },
    take: RELINK_SCAN_LIMIT,
  });
  const ids = rows
    .filter((row) => normalizeName(row[rawField], kind) === normalizedValue)
    .map((row) => row.id);
  if (ids.length === 0) return 0;
  const result = await tx.position.updateMany({
    where: { id: { in: ids }, [linkField]: null },
    data: { [linkField]: entryId },
  });
  return result.count;
}

export async function resolveUnmatchedValue(
  deps: AdminDeps,
  adminUserId: string,
  input: ResolveUnmatchedValueInput,
): Promise<ResolveUnmatchedValueOutput> {
  const parsed = resolveUnmatchedValueSchema.parse(input);
  const resolution = parsed.resolution;
  if (resolution.type === 'DISMISS') {
    const problem = findReasonProblem('UNMATCHED_RESOLVE', resolution.reason);
    if (problem !== null) throw codedValidation('AUDIT_REASON_INVALID');
  }
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const actor = await loadSystemAdmin(tx, adminUserId, now);
    // Kilit sırası sözlük yazmalarıyla aynıdır (tür kilidi → satır): ters sıra kilitlenmeye yol açardı.
    const peek = await tx.unmatchedValue.findUnique({
      where: { id: parsed.id },
      select: { kind: true },
    });
    if (!peek) throw codedNotFound('RESOURCE_NOT_FOUND');
    await lockKind(tx, peek.kind);
    await tx.$queryRaw`SELECT "id" FROM "UnmatchedValue" WHERE "id" = ${parsed.id} FOR UPDATE`;
    const row = await tx.unmatchedValue.findUnique({ where: { id: parsed.id } });
    if (!row) throw codedNotFound('RESOURCE_NOT_FOUND');
    if (statusOf(row) !== 'OPEN') throw codedConflict('UNMATCHED_NOT_OPEN');

    let entryId: string | null = null;
    let relinked = 0;
    if (resolution.type === 'DISMISS') {
      await tx.unmatchedValue.update({ where: { id: row.id }, data: { dismissedAt: now } });
    } else if (resolution.type === 'LINK') {
      // Değer, mevcut kaydın takma adı olur; sektörde takma ad yoktur.
      if (!HAS_ALIASES(row.kind)) throw codedValidation('VALIDATION_INVALID');
      const [entry] = await findRows(tx, row.kind, { ids: [resolution.entryId], take: 1 });
      if (!entry) throw codedNotFound('RESOURCE_NOT_FOUND');
      if (
        entry.normalizedName !== row.normalizedValue &&
        !entry.aliases.includes(row.normalizedValue)
      ) {
        await assertNoCollision(tx, row.kind, [row.normalizedValue], entry.id);
        await writeEntry(tx, row.kind, entry.id, {
          aliases: [...entry.aliases, row.normalizedValue].slice(0, 200),
        });
      }
      entryId = entry.id;
      await tx.unmatchedValue.update({ where: { id: row.id }, data: { resolvedToId: entry.id } });
      relinked = await relinkProfileItems(tx, row.kind, entry.id, row.normalizedValue);
    } else {
      const normalizedName = normalizeName(resolution.name, row.kind);
      if (normalizedName === '') throw codedValidation('VALIDATION_INVALID');
      const aliases = normalizeAliases(row.kind, resolution.aliases, normalizedName);
      // Çözülen değerin kendisi de yeni kaydın adı ya da takma adı olmalı ki eşleme çalışsın.
      const withValue =
        HAS_ALIASES(row.kind) &&
        row.normalizedValue !== normalizedName &&
        !aliases.includes(row.normalizedValue)
          ? [...aliases, row.normalizedValue]
          : aliases;
      await assertNoCollision(tx, row.kind, [normalizedName, ...withValue], null);
      if (resolution.sectorId !== undefined) {
        if (row.kind !== 'COMPANY') throw codedValidation('VALIDATION_INVALID');
        await assertSectorExists(tx, resolution.sectorId);
      }
      try {
        entryId = await insertEntry(tx, row.kind, {
          name: resolution.name.trim(),
          normalizedName,
          aliases: withValue,
          sectorId: resolution.sectorId ?? null,
        });
      } catch (error) {
        mapUnique(error);
      }
      await tx.unmatchedValue.update({ where: { id: row.id }, data: { resolvedToId: entryId } });
      relinked = await relinkProfileItems(tx, row.kind, entryId, row.normalizedValue);
      if (row.normalizedValue !== normalizedName) {
        // Aynı yeni kayıt, kendi adına denk gelen kalemleri de bağlasın.
        relinked += await relinkProfileItems(tx, row.kind, entryId, normalizedName);
      }
    }

    await recordAdminAction(tx, {
      actor,
      action: 'UNMATCHED_RESOLVE',
      targetType: 'UNMATCHED_VALUE',
      targetId: row.id,
      reason: resolution.type === 'DISMISS' ? resolution.reason : undefined,
      metadata: {
        kind: row.kind,
        resolution: resolution.type,
        ...(entryId ? { entryId } : {}),
        seenCount: row.count,
        relinked,
      },
    });
    return resolveUnmatchedValueOutputSchema.parse({
      id: row.id,
      status: resolution.type === 'DISMISS' ? 'DISMISSED' : 'RESOLVED',
      entryId,
    });
  }, TX_OPTIONS);
}

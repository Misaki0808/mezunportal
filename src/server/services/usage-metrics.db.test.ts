import { randomUUID } from 'node:crypto';

import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EVENT_TYPES, USAGE_EXPORT_SHEETS, type EventType } from '@/contracts/metrics';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  type Institution,
} from '@/test/fixtures';

import { deleteAccount } from './accountDeletion';
import {
  detachOldEvents,
  emitEvent,
  emitProfileThresholds,
  recordEvent,
  settleEvents,
  type EventDb,
} from './event';
import { exportUsageMetrics, getUsageMetrics } from './usage-metrics';

const db = createTestPrisma();
const deps = { db };
afterAll(() => db.$disconnect());

// Her test kendi kurumunu açar; olaylar sabit, geleceğe dönük bir pencerede (başka testlerin olayları karışmaz).
const FROM = new Date('2031-03-01T00:00:00Z');
const TO = new Date('2031-04-01T00:00:00Z');
const IN = new Date('2031-03-10T10:00:00Z');
const range = { from: FROM, to: TO };

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

async function member(
  departmentId: string,
  role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC' = 'STUDENT',
  extra: { name?: string } = {},
) {
  const userId = await createUser(db, extra);
  await addMembership(db, {
    userId,
    departmentId,
    role,
    ...(role === 'ALUMNI'
      ? { graduationYear: 2021 }
      : role === 'STUDENT'
        ? { entryYear: 2024 }
        : {}),
  });
  return userId;
}
async function adminOf(
  scope: 'DEPARTMENT' | 'FACULTY' | 'SYSTEM',
  institution: Institution,
  departmentId = institution.deptA1,
) {
  const userId = await member(departmentId, 'ACADEMIC');
  await addGrant(db, {
    userId,
    scope,
    ...(scope === 'DEPARTMENT' ? { departmentId } : {}),
    ...(scope === 'FACULTY' ? { facultyId: institution.facultyA } : {}),
  });
  return userId;
}

type Seed = {
  type: EventType;
  userId?: string | null;
  role?: 'STUDENT' | 'ALUMNI' | 'ACADEMIC' | null;
  departmentId?: string | null;
  at?: Date;
  props?: object;
};
const seed = (events: Seed[]) =>
  db.event.createMany({
    data: events.map((event) => ({
      type: event.type,
      userId: event.userId ?? null,
      role: event.role ?? null,
      departmentId: event.departmentId ?? null,
      createdAt: event.at ?? IN,
      props: event.props ?? {},
    })),
  });
/** Aynı bölüm+rolden `count` ayrı kullanıcı, her biri `each` olay. */
async function crowd(
  departmentId: string,
  role: 'STUDENT' | 'ALUMNI' | 'ACADEMIC',
  type: EventType,
  count: number,
  each = 1,
  at = IN,
) {
  const users: string[] = [];
  for (let index = 0; index < count; index += 1) users.push(await member(departmentId, role));
  await seed(
    users.flatMap((userId) =>
      Array.from({ length: each }, () => ({ type, userId, role, departmentId, at })),
    ),
  );
  return users;
}
const cell = (
  metrics: Awaited<ReturnType<typeof getUsageMetrics>>,
  type: EventType,
  role: string | null,
  departmentId: string | null,
) =>
  metrics.cells.find((c) => c.type === type && c.role === role && c.departmentId === departmentId);
const total = (metrics: Awaited<ReturnType<typeof getUsageMetrics>>, type: EventType) =>
  metrics.totalsByType.find((t) => t.type === type)!.events;

// =============================================================================================
describe('olay yazımı', () => {
  it('rol ve bölüm olay anındaki birincil doğrulanmış üyelikten gelir (akademisyen > mezun > öğrenci)', async () => {
    const inst = await createInstitution(db);
    const userId = await member(inst.deptA1, 'STUDENT');
    await addMembership(db, {
      userId,
      departmentId: inst.deptA2,
      role: 'ALUMNI',
      graduationYear: 2022,
    });
    await recordEvent(db, userId, { type: 'LOGIN', props: { method: 'EMAIL_LINK' } });
    const row = await db.event.findFirstOrThrow({ where: { userId } });
    expect(row).toMatchObject({
      type: 'LOGIN',
      role: 'ALUMNI',
      departmentId: inst.deptA2,
      props: { method: 'EMAIL_LINK' },
    });
  });

  it('doğrulanmamış/kapanmış üyelikle ve üyeliksiz kullanıcıda rol ve bölüm boştur (olay yine yazılır)', async () => {
    const inst = await createInstitution(db);
    const pending = await createUser(db);
    await addMembership(db, {
      userId: pending,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      status: 'PENDING',
      entryYear: 2024,
    });
    const none = await createUser(db);
    for (const userId of [pending, none]) {
      await recordEvent(db, userId, { type: 'CV_UPLOADED', props: {} });
      expect(await db.event.findFirstOrThrow({ where: { userId } })).toMatchObject({
        role: null,
        departmentId: null,
      });
    }
    await recordEvent(db, null, { type: 'SEARCH', props: { filters: ['q'], results: 'NONE' } });
  });

  it('rol sonradan değişse de geçmiş olay eski anlık görüntüyü korur', async () => {
    const inst = await createInstitution(db);
    const userId = await member(inst.deptA1, 'STUDENT');
    await recordEvent(db, userId, { type: 'MENTOR_VIEWED', props: {} });
    await db.membership.updateMany({ where: { userId }, data: { endedAt: new Date() } });
    await addMembership(db, {
      userId,
      departmentId: inst.deptA2,
      role: 'ALUMNI',
      graduationYear: 2023,
    });
    await recordEvent(db, userId, { type: 'MENTOR_VIEWED', props: {} });
    const rows = await db.event.findMany({ where: { userId }, orderBy: { id: 'asc' } });
    expect(rows.map((r) => [r.role, r.departmentId])).toEqual([
      ['STUDENT', inst.deptA1],
      ['ALUMNI', inst.deptA2],
    ]);
  });

  it('KİŞİSEL VERİ içeren props yazılmaz: e-posta, telefon, ad, serbest metin (şema reddeder, satır oluşmaz)', async () => {
    const inst = await createInstitution(db);
    const userId = await member(inst.deptA1);
    const email = `${randomUUID()}@gizli.test`;
    const attempts = [
      { type: 'LOGIN', props: { method: 'EMAIL_LINK', email } },
      { type: 'SEARCH', props: { filters: ['q'], results: 'FEW', query: 'veri analisti' } },
      { type: 'CV_APPLIED', props: { created: 1, updated: 0, name: 'Ayşe Yılmaz' } },
      { type: 'CONTACT_REQUESTED', props: { fieldCount: 2, phone: '05321234567' } },
      { type: 'LOGIN', props: { method: email } },
    ] as never[];
    for (const attempt of attempts)
      await expect(recordEvent(db, userId, attempt)).rejects.toThrow();
    expect(await db.event.count({ where: { userId } })).toBe(0);
  });

  it('veritabanı CHECK ek ağı: doğrudan ekleme ile e-posta/uzun rakam dizisi/nesne olmayan props reddedilir', async () => {
    const bad: unknown[] = [
      { x: 'a@b.co' },
      { x: '05321234567' },
      { x: 'y'.repeat(600) },
      [1, 2],
      'metin',
    ];
    for (const props of bad) {
      await expect(
        db.event.create({ data: { type: 'LOGIN', props: props as never } }),
      ).rejects.toThrow(/Event_props_check/);
    }
    await expect(
      db.event.create({ data: { type: 'LOGIN', props: { method: 'LINKEDIN' } } }),
    ).resolves.toBeTruthy();
  });

  it('emitEvent: beklemez, hata fırlatmaz, kullanıcı akışını bozmaz (bozuk veritabanında da)', async () => {
    const broken = {
      event: {
        create: async () => {
          throw new Error('veritabanı kapalı');
        },
      },
      membership: {
        findMany: async () => {
          throw new Error('veritabanı kapalı');
        },
      },
    } as unknown as EventDb;
    const userId = await member((await createInstitution(db)).deptA1);
    expect(() =>
      emitEvent(broken, userId, { type: 'LOGIN', props: { method: 'EMAIL_LINK' } }),
    ).not.toThrow();
    expect(() =>
      emitEvent(broken, userId, { type: 'LOGIN', props: { method: 'x' } } as never),
    ).not.toThrow();
    await expect(settleEvents()).resolves.toBeUndefined();
    emitEvent(db, userId, { type: 'FAQ_REQUESTED', props: {} });
    await settleEvents();
    expect(await db.event.count({ where: { userId, type: 'FAQ_REQUESTED' } })).toBe(1);
  });
});

describe('profil eşiği olayı', () => {
  it('yukarı yönlü geçişte eşik başına BİR kez; aşağı yönde ve aynı seviyede yok; tekrar çağrı çift üretmez', async () => {
    const userId = await member((await createInstitution(db)).deptA1);
    const thresholds = async () =>
      (await db.event.findMany({ where: { userId, type: 'PROFILE_THRESHOLD' } }))
        .map((e) => (e.props as { threshold: number }).threshold)
        .sort((a, b) => a - b);
    emitProfileThresholds(db, userId, 0, 40);
    await settleEvents();
    expect(await thresholds()).toEqual([]);
    emitProfileThresholds(db, userId, 40, 85);
    await settleEvents();
    expect(await thresholds()).toEqual([50, 80]);
    emitProfileThresholds(db, userId, 40, 85);
    emitProfileThresholds(db, userId, 85, 60);
    emitProfileThresholds(db, userId, 60, 85);
    await settleEvents();
    expect(await thresholds()).toEqual([50, 80]);
    emitProfileThresholds(db, userId, 85, 100);
    await settleEvents();
    expect(await thresholds()).toEqual([50, 80, 100]);
  });
});

describe('saklama ve hesap silme', () => {
  it('24 aydan eski olay kullanıcıdan kopar, sayı kalır; yenisi dokunulmaz; tekrar çalıştırmak etkisiz', async () => {
    const inst = await createInstitution(db);
    const userId = await member(inst.deptA1);
    const now = new Date('2033-01-15T00:00:00Z');
    await seed([
      {
        type: 'LOGIN',
        userId,
        departmentId: inst.deptA1,
        role: 'STUDENT',
        at: new Date('2030-12-31T00:00:00Z'),
      }, // 24 aydan eski
      {
        type: 'LOGIN',
        userId,
        departmentId: inst.deptA1,
        role: 'STUDENT',
        at: new Date('2031-02-01T00:00:00Z'),
      }, // eski (> 24 ay)
      {
        type: 'LOGIN',
        userId,
        departmentId: inst.deptA1,
        role: 'STUDENT',
        at: new Date('2032-12-01T00:00:00Z'),
      }, // yeni
    ]);
    expect(await detachOldEvents(db, now)).toBeGreaterThanOrEqual(2);
    const rows = await db.event.findMany({
      where: { departmentId: inst.deptA1 },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.userId)).toEqual([null, null, userId]);
    expect(rows).toHaveLength(3);
    expect(await detachOldEvents(db, now)).toBe(0);
  });

  it('hesap silinince olaylar kullanıcıdan hemen kopar; satırlar (sayılar) kalır', async () => {
    const inst = await createInstitution(db);
    const userId = await member(inst.deptA1);
    await seed([
      { type: 'LOGIN', userId, departmentId: inst.deptA1, role: 'STUDENT' },
      {
        type: 'SEARCH',
        userId,
        departmentId: inst.deptA1,
        role: 'STUDENT',
        props: { filters: ['q'], results: 'FEW' },
      },
    ]);
    const email = (await db.user.findUniqueOrThrow({ where: { id: userId } })).email;
    await deleteAccount(
      db,
      userId,
      { publishedContent: 'DELETE', confirmEmail: email },
      { removeStoredFiles: async () => undefined },
    );
    const rows = await db.event.findMany({ where: { departmentId: inst.deptA1 } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === null)).toBe(true);
  });
});

// =============================================================================================
describe('getUsageMetrics — kapsam ve sayılar', () => {
  it('seed edilenle ELLE SAYILAN aynıdır (tür toplamı, hücre olay ve kullanıcı sayısı)', async () => {
    const inst = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', inst);
    const students = await crowd(inst.deptA1, 'STUDENT', 'LOGIN', 4, 3); // 12 olay, 4 kullanıcı
    await crowd(inst.deptA1, 'ALUMNI', 'LOGIN', 3, 2); // 6 olay, 3 kullanıcı
    await crowd(inst.deptA1, 'STUDENT', 'SEARCH', 5, 1); // 5 olay
    const metrics = await getUsageMetrics(deps, admin, range);
    expect(total(metrics, 'LOGIN')).toBe(18);
    expect(total(metrics, 'SEARCH')).toBe(5);
    expect(total(metrics, 'CV_APPLIED')).toBe(0);
    expect(cell(metrics, 'LOGIN', 'STUDENT', inst.deptA1)).toMatchObject({
      kind: 'NAMED',
      events: 12,
      users: 4,
      departmentName: 'Bölüm A1',
    });
    expect(cell(metrics, 'LOGIN', 'ALUMNI', inst.deptA1)).toMatchObject({ events: 6, users: 3 });
    expect(cell(metrics, 'SEARCH', 'STUDENT', inst.deptA1)).toMatchObject({ events: 5, users: 5 });
    expect(metrics.activeUsers).toBe(4 + 3 + 5 + 0); // students(4) + alumni(3) + 5 farklı arayan; students LOGIN'dekilerle kesişmez
    void students;
    expect(metrics.minGroupSize).toBe(3);
    expect(metrics.totalsByType.map((t) => t.type)).toEqual([...EVENT_TYPES]);
  });

  it('yönetici yalnız kendi bölümünü görür; kapsam dışı bölüm/fakülte süzgeci boş verir; fakülte yöneticisi iki bölümü; sistem yöneticisi hepsini', async () => {
    const inst = await createInstitution(db);
    const deptAdmin = await adminOf('DEPARTMENT', inst);
    const facultyAdmin = await adminOf('FACULTY', inst);
    const system = await adminOf('SYSTEM', inst);
    await crowd(inst.deptA1, 'STUDENT', 'LOGIN', 3);
    await crowd(inst.deptA2, 'STUDENT', 'LOGIN', 4);
    await crowd(inst.deptB1, 'STUDENT', 'LOGIN', 5);
    await seed([{ type: 'LOGIN' }, { type: 'LOGIN' }]); // bölümsüz olaylar

    const dept = await getUsageMetrics(deps, deptAdmin, range);
    expect(dept.cells.every((c) => c.departmentId === inst.deptA1)).toBe(true);
    expect(total(dept, 'LOGIN')).toBe(3);
    for (const filter of [
      { departmentId: inst.deptB1 },
      { departmentId: inst.deptA2 },
      { facultyId: inst.facultyB },
    ]) {
      const empty = await getUsageMetrics(deps, deptAdmin, { ...range, ...filter });
      expect(total(empty, 'LOGIN')).toBe(0);
      expect(empty.cells).toEqual([]);
      expect(empty.activeUsers).toBeNull();
    }
    const faculty = await getUsageMetrics(deps, facultyAdmin, range);
    expect(total(faculty, 'LOGIN')).toBe(7);
    expect(new Set(faculty.cells.map((c) => c.departmentId))).toEqual(
      new Set([inst.deptA1, inst.deptA2]),
    );
    expect(
      total(
        await getUsageMetrics(deps, facultyAdmin, { ...range, facultyId: inst.facultyB }),
        'LOGIN',
      ),
    ).toBe(0);
    expect(
      total(
        await getUsageMetrics(deps, facultyAdmin, { ...range, departmentId: inst.deptA2 }),
        'LOGIN',
      ),
    ).toBe(4);
    // Sistem yöneticisi: süzgeçsiz bölümsüz olayları da sayar; süzgeçle bölüme daralır.
    const all = await getUsageMetrics(deps, system, range);
    expect(total(all, 'LOGIN')).toBeGreaterThanOrEqual(3 + 4 + 5 + 2);
    expect(
      total(await getUsageMetrics(deps, system, { ...range, departmentId: inst.deptB1 }), 'LOGIN'),
    ).toBe(5);
    expect(
      total(await getUsageMetrics(deps, system, { ...range, facultyId: inst.facultyA }), 'LOGIN'),
    ).toBe(7);
  });

  it('tarih aralığı yarı açık [from, to); tür süzgeci yalnız istenen türleri döner', async () => {
    const inst = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', inst);
    const users = await crowd(inst.deptA1, 'STUDENT', 'LOGIN', 3, 1, FROM); // from'da: dahil
    await seed(
      users.map((userId) => ({
        type: 'LOGIN' as const,
        userId,
        role: 'STUDENT' as const,
        departmentId: inst.deptA1,
        at: TO,
      })),
    ); // to'da: hariç
    await seed(
      users.map((userId) => ({
        type: 'LOGIN' as const,
        userId,
        role: 'STUDENT' as const,
        departmentId: inst.deptA1,
        at: new Date(FROM.getTime() - 1),
      })),
    ); // öncesi
    await crowd(inst.deptA1, 'STUDENT', 'SEARCH', 3);
    const metrics = await getUsageMetrics(deps, admin, range);
    expect(total(metrics, 'LOGIN')).toBe(3);
    const onlySearch = await getUsageMetrics(deps, admin, { ...range, types: ['SEARCH'] });
    expect(onlySearch.totalsByType).toEqual([{ type: 'SEARCH', events: 3 }]);
    expect(onlySearch.cells.every((c) => c.type === 'SEARCH')).toBe(true);
  });

  it('KÜÇÜK HÜCRE BASTIRMA: 3’ten az kullanıcılı hücreler tür başına OTHER’da birleşir; OTHER da 3’ün altındaysa gizlenir', async () => {
    const inst = await createInstitution(db);
    const admin = await adminOf('FACULTY', inst);
    await crowd(inst.deptA1, 'STUDENT', 'LOGIN', 5);
    await crowd(inst.deptA1, 'ALUMNI', 'LOGIN', 2); // küçük
    await crowd(inst.deptA2, 'STUDENT', 'LOGIN', 1); // küçük → OTHER = 3 kullanıcı
    await crowd(inst.deptA1, 'ACADEMIC', 'SEARCH', 2); // yalnız küçük
    await crowd(inst.deptA2, 'STUDENT', 'SEARCH', 1); // OTHER toplamı 3 → görünür
    await crowd(inst.deptA1, 'ALUMNI', 'CV_APPLIED', 2); // OTHER 2 kullanıcı → gizli
    const metrics = await getUsageMetrics(deps, admin, range);
    expect(
      metrics.cells.filter((c) => c.type === 'LOGIN').map((c) => [c.kind, c.role, c.users]),
    ).toEqual([
      ['NAMED', 'STUDENT', 5],
      ['OTHER', null, 3],
    ]);
    expect(metrics.cells.find((c) => c.type === 'LOGIN' && c.kind === 'OTHER')).toMatchObject({
      departmentId: null,
      departmentName: null,
      events: 3,
    });
    expect(metrics.cells.filter((c) => c.type === 'SEARCH').map((c) => c.kind)).toEqual(['OTHER']);
    expect(metrics.cells.filter((c) => c.type === 'CV_APPLIED')).toEqual([]);
    // Bastırılan hücrenin kimliği yanıtta yok
    expect(JSON.stringify(metrics)).not.toContain('"ACADEMIC"');
    for (const c of metrics.cells) expect(c.users).toBeGreaterThanOrEqual(3);
    // Toplam sayılar bastırılmaz
    expect(total(metrics, 'CV_APPLIED')).toBe(2);
  });

  it('etkin kullanıcı sayısı 3’ün altındaysa null; bağı kopmuş (userId null) olaylar kullanıcı sayısına girmez', async () => {
    const inst = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', inst);
    await crowd(inst.deptA1, 'STUDENT', 'LOGIN', 2);
    expect((await getUsageMetrics(deps, admin, range)).activeUsers).toBeNull();
    await seed(
      Array.from({ length: 10 }, () => ({
        type: 'LOGIN' as const,
        role: 'STUDENT' as const,
        departmentId: inst.deptA1,
      })),
    );
    const metrics = await getUsageMetrics(deps, admin, range);
    expect(metrics.activeUsers).toBeNull();
    expect(total(metrics, 'LOGIN')).toBe(12);
    expect(metrics.cells).toEqual([]); // 2 kullanıcı eşiğin altında, OTHER da 2
  });

  it('yanıtta kullanıcı kimliği, e-posta, ad yok', async () => {
    const inst = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', inst);
    const users = await crowd(inst.deptA1, 'STUDENT', 'LOGIN', 4);
    const emails = (
      await db.user.findMany({ where: { id: { in: users } }, select: { email: true } })
    ).map((u) => u.email);
    const text = JSON.stringify(await getUsageMetrics(deps, admin, range));
    for (const secret of [...users, ...emails, 'Test Kullanıcı'])
      expect(text).not.toContain(secret);
  });

  it('yetki: yönetici olmayan, askıdaki ve doğrulanmamış kullanıcı hiçbir şey göremez; geçersiz aralık reddedilir', async () => {
    const inst = await createInstitution(db);
    await expectCode(getUsageMetrics(deps, await member(inst.deptA1), range), 'AUTH_FORBIDDEN');
    await expectCode(getUsageMetrics(deps, randomUUID(), range), 'AUTH_UNAUTHENTICATED');
    const suspended = await adminOf('DEPARTMENT', inst);
    await db.user.update({ where: { id: suspended }, data: { banned: true } });
    await expectCode(getUsageMetrics(deps, suspended, range), 'AUTH_ACCOUNT_SUSPENDED');
    const unverified = await createUser(db);
    await addMembership(db, {
      userId: unverified,
      departmentId: inst.deptA1,
      role: 'ACADEMIC',
      status: 'PENDING',
    });
    await addGrant(db, { userId: unverified, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    await expectCode(getUsageMetrics(deps, unverified, range), 'AUTH_NOT_VERIFIED');
    const admin = await adminOf('DEPARTMENT', inst);
    await expect(getUsageMetrics(deps, admin, { from: TO, to: FROM })).rejects.toThrow();
    await expect(
      getUsageMetrics(deps, admin, {
        ...range,
        departmentId: inst.deptA1,
        facultyId: inst.facultyA,
      }),
    ).rejects.toThrow();
  });
});

// =============================================================================================
describe('Excel toplu aktarım', () => {
  async function read(bytes: Uint8Array) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
    return workbook;
  }

  it('sayfalar sözleşmeye uyar, Türkçe karakterler korunur, yalnız kapsamdaki sayılar ve bastırma uygulanır', async () => {
    const inst = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', inst);
    await crowd(inst.deptA1, 'STUDENT', 'LOGIN', 4, 2);
    await crowd(inst.deptA1, 'ALUMNI', 'MENTOR_VIEWED', 2);
    await crowd(inst.deptB1, 'STUDENT', 'LOGIN', 9); // kapsam dışı
    const result = await exportUsageMetrics(deps, admin, range);
    expect(result.fileName).toBe('kullanim-metrikleri.xlsx');
    expect(Array.from(result.bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
    const workbook = await read(result.bytes);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(USAGE_EXPORT_SHEETS.map((s) => s.name));
    for (const definition of USAGE_EXPORT_SHEETS) {
      expect(
        (workbook.getWorksheet(definition.name)!.getRow(1).values as unknown[]).slice(1),
      ).toEqual([...definition.columns]);
    }
    const byType = new Map(
      (workbook.getWorksheet('Olay türü')!.getSheetValues() as unknown[][])
        .filter(Array.isArray)
        .map((row) => [row[1] as string, row[2]]),
    );
    expect(byType.get('Giriş')).toBe(8);
    expect(byType.get('Mentor profili görüntülendi')).toBe(2);
    const detail = (workbook.getWorksheet('Rol ve bölüm')!.getSheetValues() as unknown[][])
      .filter(Array.isArray)
      .slice(1);
    expect(detail).toHaveLength(1); // yalnız 4 kullanıcılı hücre; 2 kullanıcılı mezun hücresi gizli
    expect(detail[0]!.slice(1)).toEqual(['Giriş', 'Öğrenci', 'Bölüm A1', 8, 4]);
    const summary = new Map(
      (workbook.getWorksheet('Özet')!.getSheetValues() as unknown[][])
        .filter(Array.isArray)
        .map((row) => [row[1] as string, row[2]]),
    );
    expect(summary.get('Kapsam')).toBe('1 bölüm');
    expect(summary.get('Etkin kullanıcı sayısı')).toBe(6);
  });

  it('dosyada kişi satırı, e-posta, ad ya da kimlik yok', async () => {
    const inst = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', inst);
    const users = await crowd(inst.deptA1, 'STUDENT', 'LOGIN', 5);
    const emails = (
      await db.user.findMany({ where: { id: { in: users } }, select: { email: true } })
    ).map((u) => u.email);
    const { bytes } = await exportUsageMetrics(deps, admin, range);
    const workbook = await read(bytes);
    const cells: string[] = [];
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row) => row.eachCell((c) => cells.push(String(c.value)))),
    );
    const text = cells.join('\n') + Buffer.from(bytes).toString('latin1');
    for (const secret of [...users, ...emails, 'Test Kullanıcı'])
      expect(text).not.toContain(secret);
    expect(cells.join('\n')).not.toMatch(/@/);
  });

  it('her dışa aktarma DATA_EXPORT kaydı yazar (hedef USAGE_METRICS, yalnız kapsam sayısı ve gün)', async () => {
    const inst = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', inst);
    await exportUsageMetrics(deps, admin, { ...range, departmentId: inst.deptA1 });
    const log = await db.adminAuditLog.findFirstOrThrow({
      where: { actorId: admin, action: 'DATA_EXPORT' },
    });
    expect(log).toMatchObject({
      targetType: 'USAGE_METRICS',
      targetId: inst.deptA1,
      metadata: { scopeDepartmentCount: 1, rangeDays: 31 },
    });
  });

  it('yetkisiz çağrı dosya üretmez ve kayıt yazmaz; saatte 10 sınırı', async () => {
    const inst = await createInstitution(db);
    const plain = await member(inst.deptA1);
    await expectCode(exportUsageMetrics(deps, plain, range), 'AUTH_FORBIDDEN');
    expect(await db.adminAuditLog.count({ where: { actorId: plain } })).toBe(0);
    const admin = await adminOf('DEPARTMENT', inst);
    const at = new Date('2031-05-05T10:00:00Z');
    for (let index = 0; index < 10; index += 1)
      await exportUsageMetrics({ db, now: () => at }, admin, range);
    await expectCode(exportUsageMetrics({ db, now: () => at }, admin, range), 'RATE_LIMITED');
    expect(await db.adminAuditLog.count({ where: { actorId: admin, action: 'DATA_EXPORT' } })).toBe(
      10,
    );
  });
});

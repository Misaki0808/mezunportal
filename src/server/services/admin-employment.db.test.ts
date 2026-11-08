import { randomUUID } from 'node:crypto';

import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  EMPLOYMENT_EXPORT_CONTENT_TYPE,
  EMPLOYMENT_EXPORT_FILE_NAME,
  EMPLOYMENT_EXPORT_SHEETS,
  REPORT_MIN_GROUP_SIZE,
  employmentReportSchema,
} from '@/contracts/admin';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  type Institution,
} from '@/test/fixtures';

import { exportEmploymentReport, getEmploymentReport } from './admin-employment';

const db = createTestPrisma();
const deps = { db };
afterAll(() => db.$disconnect());

const tag = () => `zk${randomUUID().replace(/-/g, '').slice(0, 10)}`;
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

let inst: Institution;
async function adminOf(scope: 'DEPARTMENT' | 'FACULTY' | 'SYSTEM', institution: Institution) {
  const userId = await createUser(db);
  await addMembership(db, { userId, departmentId: institution.deptA1, role: 'ACADEMIC' });
  await addGrant(db, {
    userId,
    scope,
    ...(scope === 'DEPARTMENT' ? { departmentId: institution.deptA1 } : {}),
    ...(scope === 'FACULTY' ? { facultyId: institution.facultyA } : {}),
  });
  return userId;
}
beforeAll(async () => {
  inst = await createInstitution(db);
});

const dictionary = {
  async company(name: string, sectorId: string | null = null) {
    return db.company.create({
      data: { name, normalizedName: `${name.toLowerCase()}-${tag()}`, aliases: [], sectorId },
    });
  },
  async title(name: string) {
    return db.title.create({
      data: { name, normalizedName: `${name.toLowerCase()}-${tag()}`, aliases: [] },
    });
  },
  async sector(name: string) {
    return db.sector.create({ data: { name, normalizedName: `${name.toLowerCase()}-${tag()}` } });
  },
};

type PositionSpec = {
  companyId?: string | null;
  titleId?: string | null;
  sectorId?: string | null;
  companyRaw?: string;
  titleRaw?: string;
  isCurrent?: boolean;
  startYear?: number;
  endYear?: number;
};
async function alumnus(
  departmentId: string,
  positions: PositionSpec[] = [],
  options: { graduationYear?: number; name?: string; emailDomain?: string } = {},
) {
  const userId = await createUser(db, {
    ...(options.name ? { name: options.name } : {}),
    ...(options.emailDomain ? { email: `${tag()}@${options.emailDomain}` } : {}),
  });
  await addMembership(db, {
    userId,
    departmentId,
    role: 'ALUMNI',
    graduationYear: options.graduationYear ?? 2022,
  });
  for (const position of positions) {
    await db.position.create({
      data: {
        userId,
        companyId: position.companyId ?? null,
        titleId: position.titleId ?? null,
        sectorId: position.sectorId ?? null,
        companyRaw: position.companyRaw ?? `Ham Şirket ${tag()}`,
        titleRaw: position.titleRaw ?? `Ham Unvan ${tag()}`,
        isCurrent: position.isCurrent ?? false,
        startYear: position.startYear ?? null,
        endYear: position.endYear ?? null,
        source: 'MANUAL',
      },
    });
  }
  return userId;
}
const many = async (count: number, make: () => Promise<unknown>) => {
  for (let index = 0; index < count; index += 1) await make();
};
const labels = (buckets: { type: string; label: string | null; count: number }[]) =>
  buckets.map((bucket) => [bucket.label ?? bucket.type, bucket.count]);

// =============================================================================================
describe('getEmploymentReport — sayım kuralı', () => {
  it('yalnız doğrulanmış mezun üyelikleri sayılır; öğrenci/akademisyen/bekleyen/silinmiş hariç, kapanmış mezun üyelik dahil; kişi bir kez', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const company = await dictionary.company(`Sayım ${tag()}`);
    await many(2, () => alumnus(scope.deptA1, [{ companyId: company.id, isCurrent: true }]));

    const student = await createUser(db);
    await addMembership(db, {
      userId: student,
      departmentId: scope.deptA1,
      role: 'STUDENT',
      entryYear: 2023,
    });
    const pending = await createUser(db);
    await addMembership(db, {
      userId: pending,
      departmentId: scope.deptA1,
      role: 'ALUMNI',
      status: 'PENDING',
      graduationYear: 2021,
    });
    const deleted = await alumnus(scope.deptA1);
    await db.user.update({ where: { id: deleted }, data: { deletedAt: new Date() } });
    const closed = await createUser(db);
    await addMembership(db, {
      userId: closed,
      departmentId: scope.deptA1,
      role: 'ALUMNI',
      graduationYear: 2018,
      endedAt: new Date('2024-01-01'),
    });
    // İki mezun üyeliği (A1 ve A2) olan kişi bir kez sayılır.
    const double = await alumnus(scope.deptA1);
    await addMembership(db, {
      userId: double,
      departmentId: scope.deptA2,
      role: 'ALUMNI',
      graduationYear: 2023,
    });
    const adminTwo = await adminOf('FACULTY', scope);

    // dept admin: yalnız A1 → 2 + closed + double = 4 (student/pending/deleted hariç)
    expect((await getEmploymentReport(deps, admin, {})).totalAlumni).toBe(4);
    // fakülte yöneticisi: A1 + A2, double yine bir kez
    expect((await getEmploymentReport(deps, adminTwo, {})).totalAlumni).toBe(4);
  });

  it('kişiyi temsil eden pozisyon: güncel > en son biten; her boyut aynı pozisyondan sayılır', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const [oldCompany, newCompany, oldTitle, newTitle] = await Promise.all([
      dictionary.company(`Eski ${tag()}`),
      dictionary.company(`Yeni ${tag()}`),
      dictionary.title(`Eski Unvan ${tag()}`),
      dictionary.title(`Yeni Unvan ${tag()}`),
    ]);
    await many(3, () =>
      alumnus(scope.deptA1, [
        { companyId: oldCompany.id, titleId: oldTitle.id, startYear: 2018, endYear: 2020 },
        { companyId: newCompany.id, titleId: newTitle.id, startYear: 2021, isCurrent: true },
      ]),
    );
    const report = await getEmploymentReport(deps, admin, {});
    expect(report).toMatchObject({ totalAlumni: 3, alumniWithPosition: 3 });
    expect(labels(report.distributions.COMPANY)).toEqual([[newCompany.name, 3]]);
    expect(labels(report.distributions.TITLE)).toEqual([[newTitle.name, 3]]);
  });

  it('sektör: pozisyonun kendi sektörü, yoksa şirketin sektörü; ikisi de yoksa bilinmeyen', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const [fintech, health, retail] = await Promise.all([
      dictionary.sector(`Fintek ${tag()}`),
      dictionary.sector(`Sağlık ${tag()}`),
      dictionary.sector(`Perakende ${tag()}`),
    ]);
    const bank = await dictionary.company(`Banka ${tag()}`, fintech.id);
    await many(3, () => alumnus(scope.deptA1, [{ companyId: bank.id, isCurrent: true }])); // şirket sektörü: Fintek
    await many(3, () =>
      alumnus(scope.deptA1, [{ companyId: bank.id, sectorId: health.id, isCurrent: true }]),
    ); // kendi sektörü: Sağlık
    await many(3, () => alumnus(scope.deptA1, [{ isCurrent: true }])); // bilinmeyen
    await many(2, () => alumnus(scope.deptA1, [{ sectorId: retail.id, isCurrent: true }])); // küçük grup
    const report = await getEmploymentReport(deps, admin, {});
    const rows = labels(report.distributions.SECTOR);
    expect(rows).toEqual(
      expect.arrayContaining([
        [fintech.name, 3],
        [health.name, 3],
        ['UNKNOWN', 3],
      ]),
    );
    expect(rows.find(([label]) => label === retail.name)).toBeUndefined();
    expect(rows.find(([label]) => label === 'OTHER')).toBeUndefined(); // 2 kişi < eşik
    expect(report.alumniWithPosition).toBe(11);
  });

  it('pozisyonu olmayan mezun toplamda sayılır, dağılımlarda yer almaz', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    await many(4, () => alumnus(scope.deptA1));
    const report = await getEmploymentReport(deps, admin, {});
    expect(report).toMatchObject({ totalAlumni: 4, alumniWithPosition: 0 });
    expect(report.distributions).toEqual({ SECTOR: [], TITLE: [], COMPANY: [] });
  });
});

describe('küçük hücre bastırma', () => {
  it('eşik altındaki gruplar görünmez, OTHER’da birleşir; hiçbir kova eşiğin altında değildir', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const [big, mid, tiny1, tiny2] = await Promise.all(
      ['Büyük', 'Orta', 'Küçük1', 'Küçük2'].map((name) => dictionary.company(`${name} ${tag()}`)),
    );
    await many(5, () => alumnus(scope.deptA1, [{ companyId: big!.id, isCurrent: true }]));
    await many(3, () => alumnus(scope.deptA1, [{ companyId: mid!.id, isCurrent: true }]));
    await many(2, () => alumnus(scope.deptA1, [{ companyId: tiny1!.id, isCurrent: true }]));
    await many(1, () => alumnus(scope.deptA1, [{ companyId: tiny2!.id, isCurrent: true }]));
    const report = await getEmploymentReport(deps, admin, {});
    expect(labels(report.distributions.COMPANY)).toEqual([
      [big!.name, 5],
      [mid!.name, 3],
      ['OTHER', 3],
    ]);
    const text = JSON.stringify(report);
    expect(text).not.toContain(tiny1!.name);
    expect(text).not.toContain(tiny2!.name);
    for (const dimension of Object.values(report.distributions)) {
      for (const bucket of dimension)
        expect(bucket.count).toBeGreaterThanOrEqual(REPORT_MIN_GROUP_SIZE);
    }
  });

  it('kapsamda üçten az mezun varsa dağılım boştur (tek kişi tanımlanamaz)', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const company = await dictionary.company(`Tek ${tag()}`);
    await many(2, () => alumnus(scope.deptA1, [{ companyId: company.id, isCurrent: true }]));
    const report = await getEmploymentReport(deps, admin, {});
    expect(report.alumniWithPosition).toBe(2);
    expect(report.distributions).toEqual({ SECTOR: [], TITLE: [], COMPANY: [] });
    expect(JSON.stringify(report)).not.toContain(company.name);
  });

  it('serbest metin rapora girmez: eşleşmeyen şirket/unvan yalnız UNKNOWN sayısıdır', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const secret = `GizliŞirket${tag()}`;
    await many(4, () =>
      alumnus(scope.deptA1, [
        { companyRaw: secret, titleRaw: `GizliUnvan${tag()}`, isCurrent: true },
      ]),
    );
    const report = await getEmploymentReport(deps, admin, {});
    expect(labels(report.distributions.COMPANY)).toEqual([['UNKNOWN', 4]]);
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(JSON.stringify(report)).not.toContain('GizliUnvan');
  });

  it('çıktı şeması kişi alanı taşımaz', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const company = await dictionary.company(`Şema ${tag()}`);
    await many(3, () =>
      alumnus(scope.deptA1, [{ companyId: company.id, isCurrent: true }], {
        emailDomain: 'mezun.ornek.test',
        name: `Ad ${tag()}`,
      }),
    );
    const report = await getEmploymentReport(deps, admin, {});
    expect(() => employmentReportSchema.parse(report)).not.toThrow();
    expect(JSON.stringify(report)).not.toContain('mezun.ornek.test');
  });
});

describe('kapsam ve süzgeçler', () => {
  it('yönetici yalnız kendi bölümünün mezunlarını sayar; süzgeç yetki vermez', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const company = await dictionary.company(`Kapsam ${tag()}`);
    await many(3, () => alumnus(scope.deptA1, [{ companyId: company.id, isCurrent: true }]));
    await many(4, () => alumnus(scope.deptB1, [{ companyId: company.id, isCurrent: true }]));
    await many(2, () => alumnus(scope.deptA2, [{ companyId: company.id, isCurrent: true }]));

    expect((await getEmploymentReport(deps, admin, {})).totalAlumni).toBe(3);
    // Kapsam dışı bölüm / fakülte kimliği isteyince boş rapor — başka bölümün verisi sızmaz.
    for (const filter of [
      { departmentId: scope.deptB1 },
      { facultyId: scope.facultyB },
      { departmentId: scope.deptA2 },
    ]) {
      const report = await getEmploymentReport(deps, admin, filter);
      expect(report).toMatchObject({ totalAlumni: 0, alumniWithPosition: 0 });
      expect(report.distributions.COMPANY).toEqual([]);
    }
    const faculty = await adminOf('FACULTY', scope);
    expect((await getEmploymentReport(deps, faculty, {})).totalAlumni).toBe(5);
    expect(
      (await getEmploymentReport(deps, faculty, { departmentId: scope.deptA2 })).totalAlumni,
    ).toBe(2);
    expect(
      (await getEmploymentReport(deps, faculty, { facultyId: scope.facultyB })).totalAlumni,
    ).toBe(0);
    const system = await adminOf('SYSTEM', scope);
    expect(
      (await getEmploymentReport(deps, system, { departmentId: scope.deptB1 })).totalAlumni,
    ).toBe(4);
    expect(
      (await getEmploymentReport(deps, system, { facultyId: scope.facultyA })).totalAlumni,
    ).toBe(5);
  });

  it('mezuniyet yılı aralığı; yılı olmayan mezun aralık verilince dışarıda kalır', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    await many(2, () => alumnus(scope.deptA1, [], { graduationYear: 2019 }));
    await many(3, () => alumnus(scope.deptA1, [], { graduationYear: 2022 }));
    await many(1, () => alumnus(scope.deptA1, [], { graduationYear: 2025 }));
    expect((await getEmploymentReport(deps, admin, {})).totalAlumni).toBe(6);
    expect((await getEmploymentReport(deps, admin, { graduationYearFrom: 2020 })).totalAlumni).toBe(
      4,
    );
    expect((await getEmploymentReport(deps, admin, { graduationYearTo: 2022 })).totalAlumni).toBe(
      5,
    );
    expect(
      (await getEmploymentReport(deps, admin, { graduationYearFrom: 2022, graduationYearTo: 2022 }))
        .totalAlumni,
    ).toBe(3);
    await expect(
      getEmploymentReport(deps, admin, { graduationYearFrom: 2025, graduationYearTo: 2020 }),
    ).rejects.toThrow();
    await expect(
      getEmploymentReport(deps, admin, { departmentId: scope.deptA1, facultyId: scope.facultyA }),
    ).rejects.toThrow();
  });

  it('yönetici olmayan, askıdaki ya da doğrulanmamış kullanıcı rapor alamaz', async () => {
    const plain = await createUser(db);
    await addMembership(db, {
      userId: plain,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2023,
    });
    await expectCode(getEmploymentReport(deps, plain, {}), 'AUTH_FORBIDDEN');
    await expectCode(getEmploymentReport(deps, randomUUID(), {}), 'AUTH_UNAUTHENTICATED');
    const suspended = await adminOf('DEPARTMENT', inst);
    await db.user.update({ where: { id: suspended }, data: { banned: true } });
    await expectCode(getEmploymentReport(deps, suspended, {}), 'AUTH_ACCOUNT_SUSPENDED');
  });

  it('1.000’den fazla mezun gruplar halinde işlenir ve doğru sayılır', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const company = await dictionary.company(`Çok ${tag()}`);
    const total = 1030;
    const users = Array.from({ length: total }, () => randomUUID());
    await db.user.createMany({
      data: users.map((id) => ({
        id,
        name: 'Toplu Mezun',
        email: `${id}@toplu.test.local`,
        emailVerified: true,
      })),
    });
    const verifier = await createUser(db);
    await db.membership.createMany({
      data: users.map((userId) => ({
        userId,
        departmentId: scope.deptA1,
        role: 'ALUMNI' as const,
        graduationYear: 2022,
        verificationStatus: 'VERIFIED' as const,
        verificationMethod: 'GRADUATION_DOCUMENT' as const,
        verifiedAt: new Date(),
        verifiedById: verifier,
      })),
    });
    await db.position.createMany({
      data: users.map((userId) => ({
        userId,
        companyId: company.id,
        companyRaw: 'x',
        titleRaw: 'y',
        isCurrent: true,
        source: 'MANUAL' as const,
      })),
    });
    const report = await getEmploymentReport(deps, admin, {});
    expect(report).toMatchObject({ totalAlumni: total, alumniWithPosition: total });
    expect(labels(report.distributions.COMPANY)).toEqual([[company.name, total]]);
  });
});

// =============================================================================================
describe('Excel dışa aktarma', () => {
  async function read(bytes: Uint8Array) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
    return workbook;
  }
  const cells = (workbook: ExcelJS.Workbook) => {
    const out: unknown[] = [];
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row) => row.eachCell((cell) => out.push(cell.value))),
    );
    return out;
  };

  it('Türkçe karakterler dosyada olduğu gibi geri okunur; sayfalar ve başlıklar sözleşmeye uyar', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const t = tag();
    const sector = await dictionary.sector(`Bilişim ve Çağrı Hizmetleri ${t}`);
    const company = await dictionary.company(`Şişli Öğütücü Ğ-İ-ı Ltd ${t}`, sector.id);
    const title = await dictionary.title(`Üretim Mühendisi İşçi ${t}`);
    await many(3, () =>
      alumnus(scope.deptA1, [{ companyId: company.id, titleId: title.id, isCurrent: true }]),
    );

    const result = await exportEmploymentReport(deps, admin, {});
    expect(result.fileName).toBe(EMPLOYMENT_EXPORT_FILE_NAME);
    expect(EMPLOYMENT_EXPORT_CONTENT_TYPE).toContain('spreadsheetml');
    // ZIP imzası: gerçek .xlsx.
    expect(Array.from(result.bytes.slice(0, 2))).toEqual([0x50, 0x4b]);

    const workbook = await read(result.bytes);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(
      EMPLOYMENT_EXPORT_SHEETS.map((s) => s.name),
    );
    for (const definition of EMPLOYMENT_EXPORT_SHEETS) {
      const header = workbook.getWorksheet(definition.name)!.getRow(1).values as unknown[];
      expect(header.slice(1)).toEqual([...definition.columns]);
    }
    const sectorSheet = workbook.getWorksheet('Sektör')!;
    expect([sectorSheet.getCell('A2').value, sectorSheet.getCell('B2').value]).toEqual([
      sector.name,
      3,
    ]);
    expect(workbook.getWorksheet('Şirket')!.getCell('A2').value).toBe(company.name);
    expect(workbook.getWorksheet('Unvan')!.getCell('A2').value).toBe(title.name);
    const summary = new Map(
      (workbook.getWorksheet('Özet')!.getSheetValues() as unknown[][])
        .filter((row) => Array.isArray(row))
        .map((row) => [row[1] as string, row[2]]),
    );
    expect(summary.get('Kapsamdaki mezun sayısı')).toBe(3);
    expect(summary.get('Pozisyonu olan mezun sayısı')).toBe(3);
    expect(summary.get('Küçük grup eşiği')).toBe(3);
    expect(summary.get('Kapsam')).toBe('Bölüm A1');
    expect(String(summary.get('Sayım kuralı'))).toContain('Her mezun bir kez');
  });

  it('dosyada kişi satırı ve izinsiz kişisel veri yoktur (ad, e-posta, telefon, kimlik)', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const company = await dictionary.company(`Gizlilik ${tag()}`);
    const personal = { name: `Gizli Kişi ${tag()}`, emailDomain: 'kisisel.ornek.test' };
    const users: string[] = [];
    await many(4, async () =>
      users.push(
        await alumnus(scope.deptA1, [{ companyId: company.id, isCurrent: true }], personal),
      ),
    );
    await db.user
      .updateMany({ where: { id: { in: users } }, data: { phone: '05321234567' } })
      .catch(() => undefined);

    const { bytes } = await exportEmploymentReport(deps, admin, {});
    const workbook = await read(bytes);
    const values = cells(workbook).map((value) => String(value));
    const joined = values.join('\n');
    for (const secret of [personal.name, personal.emailDomain, '05321234567', ...users]) {
      expect(joined).not.toContain(secret);
    }
    expect(joined).not.toMatch(/@/);
    // Dağılım sayfaları yalnız (etiket, sayı) çiftidir.
    for (const name of ['Sektör', 'Unvan', 'Şirket']) {
      const sheet = workbook.getWorksheet(name)!;
      expect(sheet.columnCount).toBe(2);
      sheet.eachRow((row, index) => {
        if (index > 1) expect(typeof row.getCell(2).value).toBe('number');
      });
    }
    // ZIP içinde ham metin araması: ad dosyada hiçbir biçimde geçmez.
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(personal.emailDomain);
  });

  it('bastırılmış (küçük) grup dosyada da yoktur', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const big = await dictionary.company(`BüyükŞirket ${tag()}`);
    const small = await dictionary.company(`KüçükŞirket ${tag()}`);
    await many(3, () => alumnus(scope.deptA1, [{ companyId: big.id, isCurrent: true }]));
    await many(2, () => alumnus(scope.deptA1, [{ companyId: small.id, isCurrent: true }]));
    const workbook = await read((await exportEmploymentReport(deps, admin, {})).bytes);
    const companySheet = cells(workbook).map(String).join('\n');
    expect(companySheet).toContain(big.name);
    expect(companySheet).not.toContain(small.name);
  });

  it('formül gibi görünen sözlük adı formül olarak değil, düz metin olarak yazılır', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const evil = await dictionary.company(`=HYPERLINK("http://kotu.test","tıkla") ${tag()}`);
    await many(3, () => alumnus(scope.deptA1, [{ companyId: evil.id, isCurrent: true }]));
    const workbook = await read((await exportEmploymentReport(deps, admin, {})).bytes);
    const cell = workbook.getWorksheet('Şirket')!.getCell('A2');
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.formula).toBeUndefined();
    expect(cell.value).toBe(evil.name);
  });

  it('her dışa aktarma DATA_EXPORT işlem kaydı yazar (yalnız kapsam sayısı ve yıllar)', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    await many(3, () => alumnus(scope.deptA1, [], { graduationYear: 2022 }));
    await exportEmploymentReport(deps, admin, {
      departmentId: scope.deptA1,
      graduationYearFrom: 2020,
    });
    await exportEmploymentReport(deps, admin, {});
    const logs = await db.adminAuditLog.findMany({
      where: { actorId: admin, action: 'DATA_EXPORT' },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      targetType: 'EMPLOYMENT_REPORT',
      targetId: scope.deptA1,
      metadata: {
        scopeDepartmentCount: 1,
        graduationYearFrom: 2020,
        graduationYearTo: null,
        totalAlumni: 3,
      },
    });
    expect(logs[1]).toMatchObject({ targetId: 'ALL' });
  });

  it('yetkisiz çağrı dosya üretmez, işlem kaydı yazmaz, hız sayacını artırmaz', async () => {
    const plain = await createUser(db);
    await addMembership(db, {
      userId: plain,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2023,
    });
    await expectCode(exportEmploymentReport(deps, plain, {}), 'AUTH_FORBIDDEN');
    expect(await db.adminAuditLog.count({ where: { actorId: plain } })).toBe(0);
    expect(await db.rateLimit.count({ where: { key: `app:employment-export:${plain}` } })).toBe(0);
  });

  it('kullanıcı başına saatte 10 dışa aktarma; 11. RATE_LIMITED ve kayıt/dosya üretilmez; pencere geçince açılır', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    const at = new Date('2031-05-05T10:00:00Z');
    for (let index = 0; index < 10; index += 1) {
      await exportEmploymentReport({ db, now: () => at }, admin, {});
    }
    await expectCode(exportEmploymentReport({ db, now: () => at }, admin, {}), 'RATE_LIMITED');
    expect(await db.adminAuditLog.count({ where: { actorId: admin, action: 'DATA_EXPORT' } })).toBe(
      10,
    );
    const later = new Date(at.getTime() + 3600_000 + 1000);
    await expect(
      exportEmploymentReport({ db, now: () => later }, admin, {}),
    ).resolves.toBeDefined();
    // Başka yöneticinin sayacı etkilenmez.
    const other = await adminOf('DEPARTMENT', scope);
    await expect(exportEmploymentReport({ db, now: () => at }, other, {})).resolves.toBeDefined();
  });

  it('geçersiz süzgeç dosya üretmez', async () => {
    const scope = await createInstitution(db);
    const admin = await adminOf('DEPARTMENT', scope);
    await expect(
      exportEmploymentReport(deps, admin, { graduationYearFrom: 2030, graduationYearTo: 2000 }),
    ).rejects.toThrow();
    expect(await db.adminAuditLog.count({ where: { actorId: admin } })).toBe(0);
  });
});

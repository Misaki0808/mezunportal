import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createLocalStorage } from '../external/storage/local';

import {
  MAX_DOCUMENT_BYTES,
  graduationDocumentFormSchema,
  type GraduationDocumentForm,
} from '@/contracts/graduation-document';
import { isCodedError, type ErrorCode } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { createFakeEmail } from '@/test/auth';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents as grantConsents,
  unique,
  type Institution,
} from '@/test/fixtures';

import { createMemoryStorage } from '../external/storage/memory';
import { loadActor } from '../permissions/actor';
import {
  listPendingGraduationDocuments,
  readGraduationDocumentFile,
  reviewGraduationDocument,
  uploadGraduationDocument,
} from './graduation-document';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const NOW = new Date('2026-11-08T12:00:00Z');
const SECRET = 'dev-only-insecure-secret-for-local-and-test-0000';

function pdfBytes(size = 2048): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  bytes.set(new TextEncoder().encode('%PDF-1.7\n'));
  return bytes;
}
const pdfFile = (size = 2048, type = 'application/pdf') =>
  new File([pdfBytes(size)], 'mezuniyet.pdf', { type });
const form = (
  inst: Institution,
  overrides: Partial<GraduationDocumentForm> = {},
): GraduationDocumentForm => ({
  departmentId: inst.deptA1,
  graduationYear: 2026,
  file: pdfFile(),
  ...overrides,
});

async function codeOf(operation: Promise<unknown>): Promise<ErrorCode | 'OK'> {
  try {
    await operation;
    return 'OK';
  } catch (error) {
    if (isCodedError(error)) return error.code;
    throw error;
  }
}

async function actorOf(userId: string) {
  const actor = await loadActor(prisma, userId, NOW);
  if (!actor) throw new Error('Actor yok');
  return actor;
}

let inst: Institution;
let deptAdmin: string;
let otherDeptAdmin: string;
let facultyAdmin: string;
let otherFacultyAdmin: string;
let sysAdmin: string;

async function grantRequiredConsents(userId: string) {
  await grantConsents(prisma, userId);
}

async function admin(
  departmentId: string,
  grant: Omit<Parameters<typeof addGrant>[1], 'userId'>,
  options: { consented?: boolean } = {},
) {
  const userId = await createUser(prisma);
  await addMembership(prisma, { userId, departmentId, role: 'ACADEMIC' });
  await addGrant(prisma, { userId, ...grant });
  if (options.consented !== false) await grantRequiredConsents(userId);
  return userId;
}

beforeAll(async () => {
  inst = await createInstitution(prisma);
  deptAdmin = await admin(inst.deptA1, { scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  otherDeptAdmin = await admin(inst.deptA2, { scope: 'DEPARTMENT', departmentId: inst.deptA2 });
  facultyAdmin = await admin(inst.deptA1, { scope: 'FACULTY', facultyId: inst.facultyA });
  otherFacultyAdmin = await admin(inst.deptB1, { scope: 'FACULTY', facultyId: inst.facultyB });
  sysAdmin = await admin(inst.deptA1, { scope: 'SYSTEM' });
});

function harness() {
  const storage = createMemoryStorage();
  const email = createFakeEmail();
  const deps = { db: prisma, storage, secret: SECRET, now: () => NOW, email: email.port };
  return { storage, email, deps };
}

async function newApplicant(address = `${unique('basvuran')}@mezun.test`) {
  const userId = await createUser(prisma, { email: address, name: 'Ayşe Başvuran' });
  return { userId, address, actor: await actorOf(userId) };
}

describe('uploadGraduationDocument', () => {
  it('geçerli PDF: dosya depoya yazılır, bekleyen belge + bekleyen mezun üyeliği oluşur', async () => {
    const { storage, deps } = harness();
    const { userId, actor } = await newApplicant();

    const result = await uploadGraduationDocument(
      deps,
      actor,
      form(inst, { graduationYear: 2025 }),
    );

    expect(result.status).toBe('PENDING');
    const document = await prisma.graduationDocument.findUniqueOrThrow({
      where: { id: result.documentId },
    });
    expect(document).toMatchObject({
      userId,
      departmentId: inst.deptA1,
      graduationYear: 2025,
      status: 'PENDING',
      reviewedAt: null,
    });
    expect(document.storageKey).toMatch(new RegExp(`^graduation/${userId}/[0-9a-f-]{36}\\.pdf$`));
    expect(storage.files.has(document.storageKey ?? '')).toBe(true);
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId, role: 'ALUMNI', endedAt: null },
    });
    expect(membership).toMatchObject({
      departmentId: inst.deptA1,
      verificationStatus: 'PENDING',
      verificationMethod: 'GRADUATION_DOCUMENT',
      graduationYear: 2025,
    });
  });

  it('SINIR: tam 5 MB PDF geçer; 5 MB + 1 bayt DOCUMENT_TOO_LARGE (dosya yazılmaz)', async () => {
    const { storage, deps } = harness();
    const ok = await newApplicant();
    await expect(
      uploadGraduationDocument(deps, ok.actor, form(inst, { file: pdfFile(MAX_DOCUMENT_BYTES) })),
    ).resolves.toMatchObject({ status: 'PENDING' });

    const big = await newApplicant();
    const filesBefore = storage.files.size;
    expect(
      await codeOf(
        uploadGraduationDocument(
          deps,
          big.actor,
          form(inst, { file: pdfFile(MAX_DOCUMENT_BYTES + 1) }),
        ),
      ),
    ).toBe('DOCUMENT_TOO_LARGE');
    expect(storage.files.size).toBe(filesBefore);
    expect(await prisma.graduationDocument.count({ where: { userId: big.userId } })).toBe(0);
  });

  it('sözleşme şeması aynı sınırı zaten uygular (5 MB geçer, 5 MB + 1 DOCUMENT_TOO_LARGE)', () => {
    const base = { departmentId: 'd', graduationYear: '2026' };
    expect(
      graduationDocumentFormSchema.safeParse({ ...base, file: pdfFile(MAX_DOCUMENT_BYTES) })
        .success,
    ).toBe(true);
    const tooBig = graduationDocumentFormSchema.safeParse({
      ...base,
      file: pdfFile(MAX_DOCUMENT_BYTES + 1),
    });
    expect(tooBig.success ? null : tooBig.error.issues[0]?.message).toBe('DOCUMENT_TOO_LARGE');
  });

  it('İÇERİK PDF değilse reddedilir: MIME “application/pdf” yalan söylese de (sihirli bayt)', async () => {
    const { storage, deps } = harness();
    const { actor, userId } = await newApplicant();
    for (const content of [
      '<html><script>alert(1)</script></html>',
      'MZ\u0090\u0000',
      ' %PDF-1.7',
      'PK\u0003\u0004',
    ]) {
      const fake = new File([content], 'belge.pdf', { type: 'application/pdf' });
      expect(await codeOf(uploadGraduationDocument(deps, actor, form(inst, { file: fake })))).toBe(
        'DOCUMENT_NOT_PDF',
      );
    }
    expect(storage.files.size).toBe(0);
    expect(await prisma.graduationDocument.count({ where: { userId } })).toBe(0);
  });

  it('boş dosya DOCUMENT_EMPTY', async () => {
    const { deps } = harness();
    const { actor } = await newApplicant();
    expect(
      await codeOf(
        uploadGraduationDocument(
          deps,
          actor,
          form(inst, { file: new File([], 'bos.pdf', { type: 'application/pdf' }) }),
        ),
      ),
    ).toBe('DOCUMENT_EMPTY');
  });

  it('var olmayan bölüm RESOURCE_NOT_FOUND; dosya yazılmaz', async () => {
    const { storage, deps } = harness();
    const { actor } = await newApplicant();
    expect(
      await codeOf(uploadGraduationDocument(deps, actor, form(inst, { departmentId: 'yok-yok' }))),
    ).toBe('RESOURCE_NOT_FOUND');
    expect(storage.files.size).toBe(0);
  });

  it('aynı bölüm için ikinci bekleyen belge DOCUMENT_ALREADY_PENDING; EŞZAMANLI üç yüklemeden biri geçer, artık dosya kalmaz', async () => {
    const { storage, deps } = harness();
    const { actor, userId } = await newApplicant();

    const results = await Promise.allSettled(
      [1, 2, 3].map(() => uploadGraduationDocument(deps, actor, form(inst))),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const failed of results.filter((r) => r.status === 'rejected')) {
      expect(isCodedError(failed.reason) && failed.reason.code).toBe('DOCUMENT_ALREADY_PENDING');
    }
    expect(storage.files.size).toBe(1); // reddedilenlerin dosyası geri silindi
    expect(await prisma.graduationDocument.count({ where: { userId, status: 'PENDING' } })).toBe(1);
    expect(
      await prisma.membership.count({ where: { userId, role: 'ALUMNI', endedAt: null } }),
    ).toBe(1);
  });

  it('zaten doğrulanmış mezun MEMBERSHIP_ALREADY_VERIFIED', async () => {
    const { deps } = harness();
    const { actor, userId } = await newApplicant();
    await addMembership(prisma, {
      userId,
      departmentId: inst.deptA1,
      role: 'ALUMNI',
      graduationYear: 2020,
    });
    expect(await codeOf(uploadGraduationDocument(deps, actor, form(inst)))).toBe(
      'MEMBERSHIP_ALREADY_VERIFIED',
    );
  });

  it('depolama hatasında kayıt oluşmaz; veritabanı hatasında dosya geri silinir', async () => {
    const { storage, deps } = harness();
    const { actor, userId } = await newApplicant();
    storage.failures.put = true;
    const error = await uploadGraduationDocument(deps, actor, form(inst)).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect(isCodedError(error)).toBe(false); // ham depolama hatası: eylem SERVER_UNEXPECTED’a çevirir
    expect(await prisma.graduationDocument.count({ where: { userId } })).toBe(0);
    storage.failures.put = false;
  });

  it('kullanıcı başına saatte 5 yükleme; 6.sı RATE_LIMITED', async () => {
    const { deps } = harness();
    const { actor } = await newApplicant();
    // her yüklemeden önce bekleyen belgeyi karara bağlamak yerine sınırı farklı bölümlerle zorla
    const departments = [inst.deptA1, inst.deptA2, inst.deptB1];
    let limited: ErrorCode | 'OK' = 'OK';
    for (let i = 0; i < 8 && limited !== 'RATE_LIMITED'; i += 1) {
      limited = await codeOf(
        uploadGraduationDocument(
          deps,
          actor,
          form(inst, { departmentId: departments[i % 3] ?? inst.deptA1 }),
        ),
      );
    }
    expect(limited).toBe('RATE_LIMITED');
  });
});

describe('listPendingGraduationDocuments (yönetici kuyruğu)', () => {
  async function submit(department: string, graduationYear = 2025) {
    const { storage, deps } = harness();
    const applicant = await newApplicant(`${unique('kuyruk')}@mezun.test`);
    const result = await uploadGraduationDocument(
      deps,
      applicant.actor,
      form(inst, { departmentId: department, graduationYear }),
    );
    void storage;
    return { ...applicant, documentId: result.documentId };
  }

  it('bölüm yöneticisi YALNIZ kendi bölümünün belgelerini görür; başvuran e-postası maskeli', async () => {
    const a1 = await submit(inst.deptA1);
    const a2 = await submit(inst.deptA2);

    const page = await listPendingGraduationDocuments({ db: prisma }, await actorOf(deptAdmin), {
      limit: 50,
    });

    const ids = page.items.map((item) => item.id);
    expect(ids).toContain(a1.documentId);
    expect(ids).not.toContain(a2.documentId);
    const item = page.items.find((i) => i.id === a1.documentId);
    expect(item).toMatchObject({
      departmentId: inst.deptA1,
      graduationYear: 2025,
      applicantName: 'Ayşe Başvuran',
    });
    expect(item?.maskedEmail).toMatch(/^k\*\*\*@m\*\*\*\.test$/);
    expect(JSON.stringify(page)).not.toContain(a1.address);
  });

  it('fakülte yöneticisi fakültesinin bölümlerini, sistem yöneticisi hepsini görür; başka fakülte görmez', async () => {
    const a1 = await submit(inst.deptA1);
    const a2 = await submit(inst.deptA2);
    const idsOf = async (userId: string) =>
      (
        await listPendingGraduationDocuments({ db: prisma }, await actorOf(userId), { limit: 50 })
      ).items.map((i) => i.id);

    expect(await idsOf(facultyAdmin)).toEqual(
      expect.arrayContaining([a1.documentId, a2.documentId]),
    );
    expect(await idsOf(sysAdmin)).toEqual(expect.arrayContaining([a1.documentId, a2.documentId]));
    const other = await idsOf(otherFacultyAdmin);
    expect(other).not.toContain(a1.documentId);
    expect(other).not.toContain(a2.documentId);
  });

  it('bölüm filtresi kapsam dışıysa AUTH_FORBIDDEN; kapsamdaysa yalnız o bölüm', async () => {
    const a1 = await submit(inst.deptA1);
    await submit(inst.deptA2);
    const actor = await actorOf(facultyAdmin);

    expect(
      await codeOf(
        listPendingGraduationDocuments({ db: prisma }, await actorOf(deptAdmin), {
          departmentId: inst.deptA2,
          limit: 10,
        }),
      ),
    ).toBe('AUTH_FORBIDDEN');
    const page = await listPendingGraduationDocuments({ db: prisma }, actor, {
      departmentId: inst.deptA1,
      limit: 50,
    });
    expect(page.items.every((i) => i.departmentId === inst.deptA1)).toBe(true);
    expect(page.items.map((i) => i.id)).toContain(a1.documentId);
  });

  it('yönetici olmayan, askıdaki ve doğrulanmamış yönetici kuyruğu göremez', async () => {
    const student = await createUser(prisma);
    await addMembership(prisma, { userId: student, departmentId: inst.deptA1, role: 'STUDENT' });
    const suspended = await createUser(prisma, { banned: true });
    await addMembership(prisma, { userId: suspended, departmentId: inst.deptA1, role: 'ACADEMIC' });
    await addGrant(prisma, { userId: suspended, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    const unverified = await createUser(prisma);
    await addMembership(prisma, {
      userId: unverified,
      departmentId: inst.deptA1,
      role: 'ACADEMIC',
      status: 'PENDING',
    });
    await addGrant(prisma, { userId: unverified, scope: 'DEPARTMENT', departmentId: inst.deptA1 });

    const call = async (userId: string) =>
      codeOf(listPendingGraduationDocuments({ db: prisma }, await actorOf(userId)));
    expect(await call(student)).toBe('AUTH_FORBIDDEN');
    expect(await call(suspended)).toBe('AUTH_ACCOUNT_SUSPENDED');
    expect(await call(unverified)).toBe('AUTH_NOT_VERIFIED');
    expect(await call(await createUser(prisma))).toBe('AUTH_NOT_VERIFIED'); // üyeliksiz
  });

  it('sayfalama: eskiden yeniye, imleçle devam eder, kayıt tekrarlanmaz/atlanmaz', async () => {
    const dept = (await createInstitution(prisma)).deptA1;
    const extraAdmin = await createUser(prisma);
    await addMembership(prisma, { userId: extraAdmin, departmentId: dept, role: 'ACADEMIC' });
    await addGrant(prisma, { userId: extraAdmin, scope: 'DEPARTMENT', departmentId: dept });
    await grantRequiredConsents(extraAdmin);
    const created: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const { deps } = harness();
      const applicant = await newApplicant(`${unique('sayfa')}@mezun.test`);
      const r = await uploadGraduationDocument(deps, applicant.actor, {
        departmentId: dept,
        graduationYear: 2025,
        file: pdfFile(),
      });
      created.push(r.documentId);
    }
    const actor = await actorOf(extraAdmin);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const result = await listPendingGraduationDocuments({ db: prisma }, actor, {
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...result.items.map((i) => i.id));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(seen.sort()).toEqual(created.sort());
  });

  it('geçersiz ya da kapsam dışı imleç VALIDATION_INVALID', async () => {
    const actor = await actorOf(deptAdmin);
    expect(
      await codeOf(
        listPendingGraduationDocuments({ db: prisma }, actor, { limit: 5, cursor: 'yok-yok' }),
      ),
    ).toBe('VALIDATION_INVALID');
  });
});

describe('reviewGraduationDocument', () => {
  async function pending(options: { student?: boolean } = {}) {
    const h = harness();
    const applicant = await newApplicant();
    if (options.student) {
      await addMembership(prisma, {
        userId: applicant.userId,
        departmentId: inst.deptA1,
        role: 'STUDENT',
        entryYear: 2022,
      });
    }
    const upload = await uploadGraduationDocument(
      h.deps,
      applicant.actor,
      form(inst, { graduationYear: 2026 }),
    );
    const document = await prisma.graduationDocument.findUniqueOrThrow({
      where: { id: upload.documentId },
    });
    return {
      ...h,
      ...applicant,
      documentId: upload.documentId,
      storageKey: document.storageKey ?? '',
    };
  }
  const approve = (h: Awaited<ReturnType<typeof pending>>, by = deptAdmin) =>
    reviewGraduationDocument(
      h.deps,
      { userId: by },
      { decision: 'APPROVE', documentId: h.documentId },
    );
  const reject = (
    h: Awaited<ReturnType<typeof pending>>,
    reason = 'Barkod doğrulanamadı.',
    by = deptAdmin,
  ) =>
    reviewGraduationDocument(
      h.deps,
      { userId: by },
      { decision: 'REJECT', documentId: h.documentId, reason },
    );

  it('ONAY (yeni mezun): üyelik doğrulanır, belge onaylanır, DOSYA SİLİNİR, işlem kaydı yazılır, e-posta gider', async () => {
    const h = await pending();
    expect(h.storage.files.has(h.storageKey)).toBe(true);

    const result = await approve(h);

    expect(result).toEqual({ documentId: h.documentId, decision: 'APPROVE' });
    expect(h.storage.files.has(h.storageKey)).toBe(false); // belge depoda yok
    expect(h.storage.files.size).toBe(0);
    const document = await prisma.graduationDocument.findUniqueOrThrow({
      where: { id: h.documentId },
    });
    expect(document).toMatchObject({
      status: 'APPROVED',
      storageKey: null,
      reviewedById: deptAdmin,
      rejectReason: null,
    });
    expect(document.reviewedAt).toEqual(NOW);
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: h.userId, role: 'ALUMNI', endedAt: null },
    });
    expect(membership).toMatchObject({
      verificationStatus: 'VERIFIED',
      verificationMethod: 'GRADUATION_DOCUMENT',
      verifiedById: deptAdmin,
      graduationYear: 2026,
    });
    const log = await prisma.adminAuditLog.findFirstOrThrow({
      where: { action: 'DOCUMENT_APPROVE', targetId: h.documentId },
    });
    expect(log).toMatchObject({ actorId: deptAdmin, targetType: 'GRADUATION_DOCUMENT' });
    expect(log.metadata).toMatchObject({
      userId: h.userId,
      departmentId: inst.deptA1,
      membershipId: membership.id,
    });
    expect(h.email.sent.decisions).toEqual([
      expect.objectContaining({
        to: h.address,
        userId: h.userId,
        documentId: h.documentId,
        decision: 'APPROVED',
      }),
    ]);
  });

  it('ONAY (öğrenci → mezun): öğrenci üyeliği kapanır, mezun eklenir, ROLE_TRANSITION da kaydedilir; geçmiş korunur', async () => {
    const h = await pending({ student: true });

    await approve(h);

    const memberships = await prisma.membership.findMany({
      where: { userId: h.userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(memberships.map((m) => [m.role, m.endedAt !== null, m.verificationStatus])).toEqual([
      ['STUDENT', true, 'VERIFIED'],
      ['ALUMNI', false, 'VERIFIED'],
    ]);
    expect(memberships[1]).toMatchObject({
      entryYear: 2022,
      graduationYear: 2026,
      verifiedById: deptAdmin,
    });
    const actions = (
      await prisma.adminAuditLog.findMany({
        where: {
          OR: [{ targetId: h.documentId }, { metadata: { path: ['userId'], equals: h.userId } }],
        },
      })
    )
      .map((l) => l.action)
      .sort();
    expect(actions).toEqual(['DOCUMENT_APPROVE', 'ROLE_TRANSITION']);
  });

  it('RET: gerekçe saklanır, DOSYA SİLİNİR, bekleyen mezun üyeliği kapanır (REJECTED), kayıt + e-posta; yeniden yükleme mümkün', async () => {
    const h = await pending();

    await reject(h, 'Barkod doğrulanamadı.');

    expect(h.storage.files.size).toBe(0);
    const document = await prisma.graduationDocument.findUniqueOrThrow({
      where: { id: h.documentId },
    });
    expect(document).toMatchObject({
      status: 'REJECTED',
      storageKey: null,
      rejectReason: 'Barkod doğrulanamadı.',
      reviewedById: deptAdmin,
    });
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: h.userId, role: 'ALUMNI' },
    });
    expect(membership).toMatchObject({ verificationStatus: 'REJECTED' });
    expect(membership.endedAt).toEqual(NOW);
    const log = await prisma.adminAuditLog.findFirstOrThrow({
      where: { action: 'DOCUMENT_REJECT', targetId: h.documentId },
    });
    expect(log.reason).toBe('Barkod doğrulanamadı.');
    expect(h.email.sent.decisions[0]).toMatchObject({
      decision: 'REJECTED',
      reason: 'Barkod doğrulanamadı.',
    });
    // yeniden başvuru
    await expect(uploadGraduationDocument(h.deps, h.actor, form(inst))).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it('RET gerekçesiz/kısa/kişisel veri içeren gerekçeyle YAPILAMAZ ve hiçbir şey değişmez (dosya dahil)', async () => {
    const h = await pending();
    for (const [reason, code] of [
      ['', 'AUDIT_REASON_REQUIRED'],
      ['ab', 'AUDIT_REASON_INVALID'],
      ['ayse@ogr.iu.edu.tr sahte', 'AUDIT_REASON_INVALID'],
    ] as const) {
      expect(await codeOf(reject(h, reason))).toBe(code);
    }
    expect(
      (await prisma.graduationDocument.findUniqueOrThrow({ where: { id: h.documentId } })).status,
    ).toBe('PENDING');
    expect(h.storage.files.has(h.storageKey)).toBe(true); // geri alındı: dosya hâlâ var
    expect(
      await prisma.membership.count({
        where: { userId: h.userId, role: 'ALUMNI', verificationStatus: 'REJECTED' },
      }),
    ).toBe(0);
  });

  it('YETKİ: başka bölümün yöneticisi, başka fakültenin yöneticisi, öğrenci, askıdaki ve doğrulanmamış yönetici karar veremez', async () => {
    const h = await pending();
    const student = await createUser(prisma);
    await addMembership(prisma, { userId: student, departmentId: inst.deptA1, role: 'STUDENT' });
    const suspended = await createUser(prisma, { banned: true });
    await addMembership(prisma, { userId: suspended, departmentId: inst.deptA1, role: 'ACADEMIC' });
    await addGrant(prisma, { userId: suspended, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
    const unverified = await createUser(prisma);
    await addMembership(prisma, {
      userId: unverified,
      departmentId: inst.deptA1,
      role: 'ACADEMIC',
      status: 'PENDING',
    });
    await addGrant(prisma, { userId: unverified, scope: 'DEPARTMENT', departmentId: inst.deptA1 });

    expect(await codeOf(approve(h, otherDeptAdmin))).toBe('AUTH_FORBIDDEN');
    expect(await codeOf(approve(h, otherFacultyAdmin))).toBe('AUTH_FORBIDDEN');
    expect(await codeOf(approve(h, student))).toBe('AUTH_FORBIDDEN');
    expect(await codeOf(approve(h, h.userId))).toBe('AUTH_FORBIDDEN'); // başvuran kendi belgesini onaylayamaz
    expect(await codeOf(approve(h, suspended))).toBe('AUTH_ACCOUNT_SUSPENDED');
    expect(await codeOf(approve(h, unverified))).toBe('AUTH_NOT_VERIFIED');
    expect(await codeOf(approve(h, 'yok-yok'))).toBe('AUTH_FORBIDDEN');

    expect(
      (await prisma.graduationDocument.findUniqueOrThrow({ where: { id: h.documentId } })).status,
    ).toBe('PENDING');
    expect(h.storage.files.has(h.storageKey)).toBe(true);
    expect(
      await prisma.membership.count({
        where: { userId: h.userId, verificationStatus: 'VERIFIED' },
      }),
    ).toBe(0);
    expect(h.email.sent.decisions).toHaveLength(0);
  });

  it('fakülte ve sistem yöneticisi de karar verebilir', async () => {
    for (const by of [facultyAdmin, sysAdmin]) {
      const h = await pending();
      await expect(approve(h, by)).resolves.toMatchObject({ decision: 'APPROVE' });
    }
  });

  it('var olmayan belge RESOURCE_NOT_FOUND; karar verilmiş belge DOCUMENT_NOT_PENDING', async () => {
    const h = await pending();
    expect(
      await codeOf(
        reviewGraduationDocument(
          h.deps,
          { userId: deptAdmin },
          { decision: 'APPROVE', documentId: 'yok-yok' },
        ),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
    await approve(h);
    expect(await codeOf(approve(h))).toBe('DOCUMENT_NOT_PENDING');
    expect(await codeOf(reject(h))).toBe('DOCUMENT_NOT_PENDING');
    expect(
      await prisma.adminAuditLog.count({
        where: { action: 'DOCUMENT_APPROVE', targetId: h.documentId },
      }),
    ).toBe(1);
  });

  it('EŞZAMANLI iki karar (onay + ret): yalnız biri uygulanır, tek işlem kaydı, dosya silinmiş', async () => {
    const h = await pending();
    const results = await Promise.allSettled([approve(h), reject(h), approve(h, sysAdmin)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const failed of results.filter((r) => r.status === 'rejected')) {
      expect(isCodedError(failed.reason) && failed.reason.code).toBe('DOCUMENT_NOT_PENDING');
    }
    expect(h.storage.files.size).toBe(0);
    expect(
      await prisma.adminAuditLog.count({
        where: { targetId: h.documentId, targetType: 'GRADUATION_DOCUMENT' },
      }),
    ).toBe(1);
  });

  it('dosya silinemezse karar GERİ ALINIR (karar yazılıp dosya kalmaz)', async () => {
    const h = await pending();
    h.storage.failures.delete = true;

    const error = await approve(h).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
    expect(
      (await prisma.graduationDocument.findUniqueOrThrow({ where: { id: h.documentId } })).status,
    ).toBe('PENDING');
    expect(h.storage.files.has(h.storageKey)).toBe(true);
    expect(
      await prisma.membership.count({
        where: { userId: h.userId, verificationStatus: 'VERIFIED' },
      }),
    ).toBe(0);
    expect(await prisma.adminAuditLog.count({ where: { targetId: h.documentId } })).toBe(0);
    // sonra yeniden denenebilir
    h.storage.failures.delete = false;
    await expect(approve(h)).resolves.toMatchObject({ decision: 'APPROVE' });
  });

  it('karar e-postası kuyruğa verilemezse karar yine geçerlidir', async () => {
    const h = await pending();
    h.email.fail.all = true;
    await expect(approve(h)).resolves.toMatchObject({ decision: 'APPROVE' });
    expect(
      (await prisma.graduationDocument.findUniqueOrThrow({ where: { id: h.documentId } })).status,
    ).toBe('APPROVED');
  });

  it('öğrenci mezuniyet yılı giriş yılından önceyse onay MEMBERSHIP_TRANSITION_INVALID (yönetici reddetmeli); hiçbir şey değişmez', async () => {
    const h = harness();
    const applicant = await newApplicant();
    await addMembership(prisma, {
      userId: applicant.userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    const upload = await uploadGraduationDocument(
      h.deps,
      applicant.actor,
      form(inst, { graduationYear: 2022 }),
    );

    expect(
      await codeOf(
        reviewGraduationDocument(
          h.deps,
          { userId: deptAdmin },
          { decision: 'APPROVE', documentId: upload.documentId },
        ),
      ),
    ).toBe('MEMBERSHIP_TRANSITION_INVALID');
    expect(
      (await prisma.graduationDocument.findUniqueOrThrow({ where: { id: upload.documentId } }))
        .status,
    ).toBe('PENDING');
    // reddedilebilir
    await expect(
      reviewGraduationDocument(
        h.deps,
        { userId: deptAdmin },
        { decision: 'REJECT', documentId: upload.documentId, reason: 'Tarihler tutarsız.' },
      ),
    ).resolves.toMatchObject({ decision: 'REJECT' });
  });

  it('RASTGELE üretilmiş kimliklerle 30 onay/ret: işlem kaydı süzgeci kimlikleri yanlışlıkla kişisel veri sanmaz (P1-01 dersi)', async () => {
    for (let i = 0; i < 30; i += 1) {
      const h = await pending();
      if (i % 2 === 0) await approve(h);
      else await reject(h, 'Belge okunaklı değil.');
    }
  });
});

describe('readGraduationDocumentFile (yetki kontrollü dosya akıtma)', () => {
  async function pendingDocument() {
    const h = harness();
    const applicant = await newApplicant();
    const upload = await uploadGraduationDocument(h.deps, applicant.actor, form(inst));
    return { ...h, ...applicant, documentId: upload.documentId };
  }
  const read = (h: Awaited<ReturnType<typeof pendingDocument>>, by: string) =>
    readGraduationDocumentFile(
      { db: prisma, storage: h.storage, now: () => NOW },
      by,
      h.documentId,
    );

  it('belgenin bölümünü kapsayan yönetici dosyayı okur (içerik değişmeden)', async () => {
    const h = await pendingDocument();
    for (const by of [deptAdmin, facultyAdmin, sysAdmin]) {
      const bytes = await read(h, by);
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
      expect(bytes.length).toBe(2048);
    }
  });

  it('başvuran, başka bölüm/fakülte yöneticisi, öğrenci ve oturumsuz kimlik okuyamaz', async () => {
    const h = await pendingDocument();
    expect(await codeOf(read(h, h.userId))).toBe('AUTH_FORBIDDEN');
    expect(await codeOf(read(h, otherDeptAdmin))).toBe('AUTH_FORBIDDEN');
    expect(await codeOf(read(h, otherFacultyAdmin))).toBe('AUTH_FORBIDDEN');
    expect(await codeOf(read(h, 'yok-yok'))).toBe('AUTH_FORBIDDEN');
  });

  it('karar verilmiş belgenin dosyası yoktur (RESOURCE_NOT_FOUND); olmayan belge de aynı', async () => {
    const h = await pendingDocument();
    await reviewGraduationDocument(
      h.deps,
      { userId: deptAdmin },
      { decision: 'APPROVE', documentId: h.documentId },
    );
    expect(await codeOf(read(h, deptAdmin))).toBe('RESOURCE_NOT_FOUND');
    expect(
      await codeOf(
        readGraduationDocumentFile({ db: prisma, storage: h.storage }, deptAdmin, 'yok-yok'),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
  });
});

it.each(['APPROVE', 'REJECT'] as const)(
  'yerel depoda %s kararı dosyayı hemen kaldırır',
  async (decision) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mezun-r2-document-'));
    try {
      const storage = createLocalStorage(root);
      const deps = { db: prisma, storage, secret: SECRET, now: () => NOW };
      const applicant = await newApplicant();
      const uploaded = await uploadGraduationDocument(deps, applicant.actor, form(inst));
      const document = await prisma.graduationDocument.findUniqueOrThrow({
        where: { id: uploaded.documentId },
      });
      const key = document.storageKey!;
      expect(await storage.get(key)).not.toBeNull();
      await reviewGraduationDocument(
        deps,
        { userId: deptAdmin },
        decision === 'APPROVE'
          ? { documentId: document.id, decision }
          : { documentId: document.id, decision, reason: 'Belgede mezuniyet bilgisi eksik.' },
      );
      expect(await storage.get(key)).toBeNull();
      expect(
        (await prisma.graduationDocument.findUniqueOrThrow({ where: { id: document.id } }))
          .storageKey,
      ).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

describe('rıza kapısı: yönetim işleri zorunlu onay ister (tur bulgusu #11)', () => {
  it('onayı olmayan yönetici kuyruğu göremez, karar veremez, dosya okuyamaz (CONSENT_REQUIRED); onaydan sonra hepsi açılır', async () => {
    const unconsented = await admin(
      inst.deptA1,
      { scope: 'DEPARTMENT', departmentId: inst.deptA1 },
      { consented: false },
    );
    const h = harness();
    const applicant = await newApplicant();
    const upload = await uploadGraduationDocument(h.deps, applicant.actor, form(inst));

    expect(
      await codeOf(listPendingGraduationDocuments({ db: prisma }, await actorOf(unconsented), {})),
    ).toBe('CONSENT_REQUIRED');
    await expect(
      readGraduationDocumentFile(
        { db: prisma, storage: h.storage, now: () => NOW },
        unconsented,
        upload.documentId,
      ),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(
      await codeOf(
        reviewGraduationDocument(
          h.deps,
          { userId: unconsented },
          { decision: 'APPROVE', documentId: upload.documentId },
        ),
      ),
    ).toBe('CONSENT_REQUIRED');
    // Karar verilmedi: belge hâlâ bekliyor, dosya duruyor.
    expect(
      (await prisma.graduationDocument.findUniqueOrThrow({ where: { id: upload.documentId } }))
        .status,
    ).toBe('PENDING');

    await grantRequiredConsents(unconsented);
    const page = await listPendingGraduationDocuments({ db: prisma }, await actorOf(unconsented), {
      limit: 50,
    });
    expect(page.items.map((item) => item.id)).toContain(upload.documentId);
  });

  it('yetkisi olmayan kullanıcıya rıza durumu söylenmez: önce yetki (AUTH_FORBIDDEN)', async () => {
    const member = await createUser(prisma);
    await addMembership(prisma, { userId: member, departmentId: inst.deptA1, role: 'ACADEMIC' });
    expect(
      await codeOf(listPendingGraduationDocuments({ db: prisma }, await actorOf(member), {})),
    ).toBe('AUTH_FORBIDDEN');
  });
});

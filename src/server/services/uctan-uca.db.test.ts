import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isCodedError, type ErrorCode } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { createTestAuth, signInWithMagicLink, uniqueAddress } from '@/test/auth';
import {
  addGrant,
  grantRequiredConsents,
  addMembership,
  createInstitution,
  createUser,
  unique,
  type Institution,
} from '@/test/fixtures';

import { createMemoryStorage } from '../external/storage/memory';
import { loadActor } from '../permissions/actor';
import { createPermissions } from '../permissions/guards';
import * as flow from './auth-flow';
import * as documents from './graduation-document';

// Üç kullanıcı türü UÇTAN UCA: gerçek Better Auth (e-posta bağlantısı → çerez → oturum), gerçek yetki
// korumaları, gerçek servisler, gerçek veritabanı. Yalnız e-posta kuyruğu ve dosya deposu sahte.
const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const STUDENT_DOMAIN = `ogr.${unique('uni')}.test`;
const STAFF_DOMAIN = `pers.${unique('uni')}.test`;
let inst: Institution;
let deptAdminId: string;

beforeAll(async () => {
  inst = await createInstitution(prisma, {
    studentEmailDomains: [STUDENT_DOMAIN],
    staffEmailDomains: [STAFF_DOMAIN],
  });
  deptAdminId = await createUser(prisma);
  await addMembership(prisma, { userId: deptAdminId, departmentId: inst.deptA1, role: 'ACADEMIC' });
  await addGrant(prisma, { userId: deptAdminId, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  await grantRequiredConsents(prisma, deptAdminId);
});

function world() {
  const harness = createTestAuth(prisma);
  const storage = createMemoryStorage();
  const now = () => new Date();
  const flowDeps = { db: prisma, auth: harness.auth, env: harness.env, now };
  const documentDeps = {
    db: prisma,
    storage,
    secret: harness.env.BETTER_AUTH_SECRET,
    now,
    email: harness.port,
  };
  /** Oturum çerezinden çalışan yetki korumaları (üretimdeki `getSessionUserId`'nin birebir karşılığı). */
  const permissionsFor = (headers: Headers) =>
    createPermissions({
      db: () => prisma,
      getSessionUserId: async () =>
        (await harness.auth.api.getSession({ headers }))?.user.id ?? null,
      now,
    });
  return { ...harness, storage, flowDeps, documentDeps, permissionsFor };
}

async function code(operation: Promise<unknown>): Promise<ErrorCode | 'OK'> {
  try {
    await operation;
    return 'OK';
  } catch (error) {
    if (isCodedError(error)) return error.code;
    throw error;
  }
}

const pdf = () =>
  new File([new TextEncoder().encode('%PDF-1.7\nmezuniyet belgesi')], 'belge.pdf', {
    type: 'application/pdf',
  });

describe('ÖĞRENCİ: okul e-postasıyla giriş → bölüm/giriş yılı beyanı → doğrulanmış', () => {
  it('uçtan uca', async () => {
    const w = world();
    const address = uniqueAddress(STUDENT_DOMAIN, 'ogrenci');
    const { headers } = await signInWithMagicLink(w.auth, w.sent, address);
    const permissions = w.permissionsFor(headers);

    // Giriş yaptı ama henüz doğrulanmadı: yalnız kendi profili; dizin/üye alanları sunucuda REDDEDİLİR.
    const actor = await permissions.requireUser();
    expect(await code(permissions.requireVerifiedMember())).toBe('AUTH_NOT_VERIFIED');
    expect(await code(permissions.requireMentor())).toBe('AUTH_NOT_VERIFIED');
    expect(
      await code(permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: inst.deptA1 })),
    ).toBe('AUTH_FORBIDDEN');
    expect(await flow.getVerificationState(prisma, actor)).toMatchObject({
      status: 'NOT_STARTED',
      emailKind: 'STUDENT_DOMAIN',
    });
    expect((await flow.listSelectableDepartments(prisma, actor)).scope).toBe('EMAIL_DOMAIN');

    await flow.declareMembership(w.flowDeps, actor, {
      role: 'STUDENT',
      departmentId: inst.deptA1,
      entryYear: 2025,
    });

    await expect(
      permissions.requireVerifiedMember({ roles: ['STUDENT'], departmentId: inst.deptA1 }),
    ).resolves.toBeDefined();
    expect(await flow.getVerificationState(prisma, actor)).toMatchObject({ status: 'VERIFIED' });
    expect(await code(permissions.requireVerifiedMember({ roles: ['ALUMNI'] }))).toBe(
      'AUTH_FORBIDDEN',
    );
  });
});

describe('AKADEMİSYEN: kurumsal e-postayla giriş → bölüm beyanı → doğrulanmış', () => {
  it('uçtan uca', async () => {
    const w = world();
    const { headers } = await signInWithMagicLink(
      w.auth,
      w.sent,
      uniqueAddress(STAFF_DOMAIN, 'hoca'),
    );
    const permissions = w.permissionsFor(headers);
    const actor = await permissions.requireUser();

    expect(await flow.getVerificationState(prisma, actor)).toMatchObject({
      status: 'NOT_STARTED',
      emailKind: 'STAFF_DOMAIN',
    });
    expect(await code(permissions.requireVerifiedMember())).toBe('AUTH_NOT_VERIFIED');
    // personel alan adıyla öğrenci olunamaz
    expect(
      await code(
        flow.declareMembership(w.flowDeps, actor, {
          role: 'STUDENT',
          departmentId: inst.deptA1,
          entryYear: 2025,
        }),
      ),
    ).toBe('EMAIL_DOMAIN_NOT_ALLOWED');

    await flow.declareMembership(w.flowDeps, actor, {
      role: 'ACADEMIC',
      departmentId: inst.deptA2,
    });

    await expect(permissions.requireVerifiedMember({ roles: ['ACADEMIC'] })).resolves.toBeDefined();
    // doğrulanmış akademisyen YÖNETİCİ değildir
    expect(
      await code(permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: inst.deptA2 })),
    ).toBe('AUTH_FORBIDDEN');
  });
});

describe('MEZUN: kişisel e-postayla giriş → mezun belgesi → yönetici onayı → doğrulanmış', () => {
  it('uçtan uca (ret → yeniden başvuru → onay)', async () => {
    const w = world();
    const address = uniqueAddress('gmail.test', 'mezun');
    const { headers } = await signInWithMagicLink(w.auth, w.sent, address);
    const permissions = w.permissionsFor(headers);
    const actor = await permissions.requireUser();

    // Kişisel e-posta: bütün bölümler seçilebilir, alan adıyla doğrulanamaz.
    expect(await flow.getVerificationState(prisma, actor)).toMatchObject({
      status: 'NOT_STARTED',
      emailKind: 'OTHER',
    });
    const listed = await flow.listSelectableDepartments(prisma, actor);
    expect(listed.scope).toBe('ALL');
    expect(listed.departments.map((d) => d.id)).toContain(inst.deptA1);
    expect(
      await code(
        flow.declareMembership(w.flowDeps, actor, {
          role: 'STUDENT',
          departmentId: inst.deptA1,
          entryYear: 2020,
        }),
      ),
    ).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect(await code(permissions.requireVerifiedMember())).toBe('AUTH_NOT_VERIFIED');

    // Belge yükle → yönetici onayını bekler.
    const uploaded = await documents.uploadGraduationDocument(w.documentDeps, actor, {
      departmentId: inst.deptA1,
      graduationYear: 2025,
      file: pdf(),
    });
    const awaiting = await flow.getVerificationState(prisma, actor);
    expect(awaiting).toMatchObject({
      status: 'AWAITING_REVIEW',
      pendingDocument: { id: uploaded.documentId, departmentId: inst.deptA1, graduationYear: 2025 },
    });
    expect(await code(permissions.requireVerifiedMember())).toBe('AUTH_NOT_VERIFIED'); // henüz doğrulanmadı
    expect(w.storage.files.size).toBe(1);

    // Yönetici KUYRUKTA görür (e-posta maskeli) ve gerekçeyle REDDEDER.
    const adminActor =
      (await loadActor(prisma, deptAdminId, new Date())) ??
      (() => {
        throw new Error('yok');
      })();
    const queue = await documents.listPendingGraduationDocuments({ db: prisma }, adminActor, {
      limit: 50,
    });
    const item = queue.items.find((i) => i.id === uploaded.documentId);
    expect(item?.maskedEmail).not.toContain(address.split('@')[0]);
    await documents.reviewGraduationDocument(
      w.documentDeps,
      { userId: deptAdminId },
      { decision: 'REJECT', documentId: uploaded.documentId, reason: 'Barkod doğrulanamadı.' },
    );

    expect(w.storage.files.size).toBe(0);
    expect(await flow.getVerificationState(prisma, actor)).toMatchObject({
      status: 'REJECTED',
      pendingDocument: null,
      rejection: { departmentId: inst.deptA1, reason: 'Barkod doğrulanamadı.' },
    });
    expect(w.sent.decisions.at(-1)).toMatchObject({ decision: 'REJECTED', to: address });

    // Yeniden başvuru → onay.
    const second = await documents.uploadGraduationDocument(w.documentDeps, actor, {
      departmentId: inst.deptA1,
      graduationYear: 2025,
      file: pdf(),
    });
    await documents.reviewGraduationDocument(
      w.documentDeps,
      { userId: deptAdminId },
      { decision: 'APPROVE', documentId: second.documentId },
    );

    expect(w.storage.files.size).toBe(0); // onaydan sonra belge depoda YOK
    expect(await flow.getVerificationState(prisma, actor)).toMatchObject({
      status: 'VERIFIED',
      rejection: null,
      pendingDocument: null,
    });
    await expect(
      permissions.requireVerifiedMember({ roles: ['ALUMNI'], departmentId: inst.deptA1 }),
    ).resolves.toBeDefined();
    expect(w.sent.decisions.at(-1)).toMatchObject({ decision: 'APPROVED', to: address });
    expect(
      await prisma.adminAuditLog.count({
        where: {
          actorId: deptAdminId,
          action: { in: ['DOCUMENT_REJECT', 'DOCUMENT_APPROVE'] },
          targetId: { in: [uploaded.documentId, second.documentId] },
        },
      }),
    ).toBe(2);
  });

  it('mezun belgesi akışı başkasının hesabına dokunamaz: başvuran yalnız kendi kimliğiyle yazar', async () => {
    const w = world();
    const mine = await signInWithMagicLink(w.auth, w.sent, uniqueAddress('gmail.test', 'ben'));
    const other = await createUser(prisma);
    const actor = await w.permissionsFor(mine.headers).requireUser();

    const uploaded = await documents.uploadGraduationDocument(w.documentDeps, actor, {
      departmentId: inst.deptB1,
      graduationYear: 2024,
      file: pdf(),
    });

    const document = await prisma.graduationDocument.findUniqueOrThrow({
      where: { id: uploaded.documentId },
    });
    expect(document.userId).toBe(actor.userId);
    expect(document.userId).not.toBe(other);
    expect(await prisma.membership.count({ where: { userId: other } })).toBe(0);
  });
});

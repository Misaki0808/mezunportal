import { randomInt, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTestAuth, signInWithMagicLink } from '@/test/auth';
import { createLocalStorage } from '../external/storage/local';
import { afterAll, describe, expect, it } from 'vitest';

import { dataExportSchema } from '@/contracts/privacy';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser } from '@/test/fixtures';

import { createPermissions } from '../permissions';
import { DELETED_USER_NAME, deleteAccount, deletedEmailFor } from './accountDeletion';
import {
  listContactRequests,
  respondToContactRequest,
  revokeContactRequest,
  sendContactRequest,
  withdrawContactRequest,
} from './contactRequest';
import { buildDataExport } from './dataExport';
import { getConsentState, getFieldVisibility, recordConsents, setFieldVisibility } from './privacy';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const V1 = {
  PRIVACY_NOTICE: 'taslak-1',
  TERMS_OF_USE: 'taslak-1',
  CROSS_BORDER_TRANSFER: 'taslak-1',
} as const;

async function errorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, 'hata bekleniyordu').not.toBeNull();
  return isCodedError(error) ? error.code : String(error);
}

/** Rastgele kişi: e-posta ve telefon her koşuda farklı (sızıntı testi sabit örneğe güvenmez). */
async function person() {
  const email = `p${randomUUID().replaceAll('-', '').slice(0, 12)}@ornek${randomInt(100, 999)}.edu.tr`;
  const phone = `+90 5${randomInt(10, 99)} ${randomInt(100, 999)} ${randomInt(10, 99)} ${randomInt(10, 99)}`;
  const id = await createUser(prisma);
  await prisma.user.update({ where: { id }, data: { email, phone } });
  return { id, email, phone };
}

describe('rıza', () => {
  it('zorunlu onaylar kaydedilince kilit açılır; her karar yeni satırdır', async () => {
    const userId = await createUser(prisma);
    expect((await getConsentState(prisma, userId, V1)).blocking).toBe(true);
    const state = await recordConsents(
      prisma,
      userId,
      [
        { documentType: 'PRIVACY_NOTICE', version: 'taslak-1', granted: true },
        { documentType: 'TERMS_OF_USE', version: 'taslak-1', granted: true },
      ],
      V1,
    );
    expect(state.blocking).toBe(false);
    await recordConsents(
      prisma,
      userId,
      [{ documentType: 'CROSS_BORDER_TRANSFER', version: 'taslak-1', granted: true }],
      V1,
    );
    await recordConsents(
      prisma,
      userId,
      [{ documentType: 'CROSS_BORDER_TRANSFER', version: 'taslak-1', granted: false }],
      V1,
    );
    expect(await prisma.consent.count({ where: { userId } })).toBe(4);
  });

  it('yeni metin sürümünde yeniden onaya yönlenir', async () => {
    const userId = await createUser(prisma);
    await recordConsents(
      prisma,
      userId,
      [
        { documentType: 'PRIVACY_NOTICE', version: 'taslak-1', granted: true },
        { documentType: 'TERMS_OF_USE', version: 'taslak-1', granted: true },
      ],
      V1,
    );
    const V2 = { ...V1, TERMS_OF_USE: 'taslak-2' } as const;
    const stale = await getConsentState(prisma, userId, V2);
    expect(stale.blocking).toBe(true);
    expect(stale.documents.find((d) => d.documentType === 'TERMS_OF_USE')?.needsAction).toBe(true);
  });

  it('eski sürüm ve zorunlu belgenin reddi kaydedilmez (hiçbir satır yazılmaz)', async () => {
    const userId = await createUser(prisma);
    expect(
      await errorCode(
        recordConsents(
          prisma,
          userId,
          [{ documentType: 'PRIVACY_NOTICE', version: 'taslak-0', granted: true }],
          V1,
        ),
      ),
    ).toBe('CONSENT_VERSION_OUTDATED');
    expect(
      await errorCode(
        recordConsents(
          prisma,
          userId,
          [
            { documentType: 'CROSS_BORDER_TRANSFER', version: 'taslak-1', granted: true },
            { documentType: 'TERMS_OF_USE', version: 'taslak-1', granted: false },
          ],
          V1,
        ),
      ),
    ).toBe('CONSENT_REQUIRED');
    expect(await prisma.consent.count({ where: { userId } })).toBe(0);
  });
});

describe('alan görünürlüğü', () => {
  it('varsayılanlar işaretli döner; seçim kaydedilir ve tekrar seçilince güncellenir', async () => {
    const userId = await createUser(prisma);
    const initial = await getFieldVisibility(prisma, userId);
    expect(initial.fields.find((f) => f.field === 'EMAIL')).toEqual({
      field: 'EMAIL',
      level: 'ON_APPROVED_REQUEST',
      isDefault: true,
    });
    await setFieldVisibility(prisma, userId, { field: 'EMAIL', level: 'PRIVATE' });
    const after = await setFieldVisibility(prisma, userId, { field: 'EMAIL', level: 'MEMBERS' });
    expect(after.fields.find((f) => f.field === 'EMAIL')).toEqual({
      field: 'EMAIL',
      level: 'MEMBERS',
      isDefault: false,
    });
    expect(await prisma.fieldVisibility.count({ where: { userId } })).toBe(1);
  });
});

describe('iletişim talebi', () => {
  it('talep → onay: alanlar YALNIZ talep edene görünür; geri alınca kaybolur; hiçbir yanıtta sızıntı yok', async () => {
    const requester = await person();
    const target = await person();
    const outsider = await person();

    const sent = await sendContactRequest(prisma, requester.id, {
      targetUserId: target.id,
      fields: ['EMAIL', 'PHONE'],
      message: 'Merhaba',
    });
    const responses: unknown[] = [sent];

    // Beklerken: iki kutuda da hedefin iletişimi yok.
    responses.push(await listContactRequests(prisma, requester.id, { box: 'OUTGOING', limit: 20 }));
    responses.push(await listContactRequests(prisma, target.id, { box: 'INCOMING', limit: 20 }));
    for (const response of responses) {
      const json = JSON.stringify(response);
      expect(json).not.toContain(target.email);
      expect(json).not.toContain(target.phone);
      expect(json).not.toContain(requester.email);
      expect(json).not.toContain(requester.phone);
    }

    await respondToContactRequest(prisma, target.id, {
      requestId: sent.requestId,
      decision: 'APPROVE',
    });
    const approved = await listContactRequests(prisma, requester.id, {
      box: 'OUTGOING',
      limit: 20,
    });
    expect(approved.items[0]?.revealed).toEqual({ EMAIL: target.email, PHONE: target.phone });
    // Hedefin gelen kutusu talep edenin iletişimini ASLA taşımaz.
    const incoming = JSON.stringify(
      await listContactRequests(prisma, target.id, { box: 'INCOMING', limit: 20 }),
    );
    expect(incoming).not.toContain(requester.email);
    expect(incoming).not.toContain(requester.phone);
    // Üçüncü kişi hiçbir kutuda bu talebi görmez.
    const outsiderView = JSON.stringify([
      await listContactRequests(prisma, outsider.id, { box: 'INCOMING', limit: 20 }),
      await listContactRequests(prisma, outsider.id, { box: 'OUTGOING', limit: 20 }),
    ]);
    expect(outsiderView).not.toContain(target.email);

    // Hedef alanı sonradan PRIVATE yaparsa o alan artık dönmez.
    await setFieldVisibility(prisma, target.id, { field: 'PHONE', level: 'PRIVATE' });
    expect(
      (await listContactRequests(prisma, requester.id, { box: 'OUTGOING', limit: 20 })).items[0]
        ?.revealed,
    ).toEqual({ EMAIL: target.email });

    await revokeContactRequest(prisma, target.id, { requestId: sent.requestId });
    const revoked = await listContactRequests(prisma, requester.id, { box: 'OUTGOING', limit: 20 });
    expect(revoked.items[0]).toMatchObject({ status: 'REVOKED', revealed: null });
    expect(JSON.stringify(revoked)).not.toContain(target.email);
  });

  it('kendine, gizli/üyelere açık alana, silinmiş hedefe ve açık talep varken ikinci talep reddedilir', async () => {
    const requester = await person();
    const target = await person();
    expect(
      await errorCode(
        sendContactRequest(prisma, requester.id, { targetUserId: requester.id, fields: ['EMAIL'] }),
      ),
    ).toBe('CONTACT_REQUEST_SELF');
    await setFieldVisibility(prisma, target.id, { field: 'EMAIL', level: 'PRIVATE' });
    expect(
      await errorCode(
        sendContactRequest(prisma, requester.id, { targetUserId: target.id, fields: ['EMAIL'] }),
      ),
    ).toBe('CONTACT_FIELD_NOT_REQUESTABLE');
    expect(
      await errorCode(
        sendContactRequest(prisma, requester.id, { targetUserId: target.id, fields: ['LINKEDIN'] }),
      ),
    ).toBe('CONTACT_FIELD_NOT_REQUESTABLE');
    await sendContactRequest(prisma, requester.id, { targetUserId: target.id, fields: ['PHONE'] });
    expect(
      await errorCode(
        sendContactRequest(prisma, requester.id, { targetUserId: target.id, fields: ['PHONE'] }),
      ),
    ).toBe('CONTACT_REQUEST_ALREADY_OPEN');
    const deleted = await createUser(prisma, { deletedAt: new Date() });
    expect(
      await errorCode(
        sendContactRequest(prisma, requester.id, { targetUserId: deleted, fields: ['PHONE'] }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
    expect(
      await errorCode(
        sendContactRequest(prisma, requester.id, { targetUserId: 'yok', fields: ['PHONE'] }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
  });

  it('başkasının talebine dokunma “bulunamadı”; yanlış durumdaki geçiş kendi kodunu verir', async () => {
    const requester = await person();
    const target = await person();
    const stranger = await person();
    const { requestId } = await sendContactRequest(prisma, requester.id, {
      targetUserId: target.id,
      fields: ['EMAIL'],
    });
    expect(
      await errorCode(
        respondToContactRequest(prisma, stranger.id, { requestId, decision: 'APPROVE' }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
    expect(
      await errorCode(
        respondToContactRequest(prisma, requester.id, { requestId, decision: 'APPROVE' }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
    expect(await errorCode(withdrawContactRequest(prisma, target.id, { requestId }))).toBe(
      'RESOURCE_NOT_FOUND',
    );
    expect(await errorCode(revokeContactRequest(prisma, target.id, { requestId }))).toBe(
      'CONTACT_REQUEST_NOT_APPROVED',
    );
    await withdrawContactRequest(prisma, requester.id, { requestId });
    expect(
      await errorCode(
        respondToContactRequest(prisma, target.id, { requestId, decision: 'APPROVE' }),
      ),
    ).toBe('CONTACT_REQUEST_NOT_PENDING');
  });

  it('eşzamanlı iki karar: yalnız biri geçer', async () => {
    const requester = await person();
    const target = await person();
    const { requestId } = await sendContactRequest(prisma, requester.id, {
      targetUserId: target.id,
      fields: ['EMAIL'],
    });
    const results = await Promise.allSettled([
      respondToContactRequest(prisma, target.id, { requestId, decision: 'APPROVE' }),
      respondToContactRequest(prisma, target.id, { requestId, decision: 'REJECT' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('hız sınırı: günde 10 talep, 11.si RATE_LIMITED', async () => {
    const requester = await person();
    for (let i = 0; i < 10; i += 1) {
      const target = await person();
      await sendContactRequest(prisma, requester.id, {
        targetUserId: target.id,
        fields: ['EMAIL'],
      });
    }
    const last = await person();
    expect(
      await errorCode(
        sendContactRequest(prisma, requester.id, { targetUserId: last.id, fields: ['EMAIL'] }),
      ),
    ).toBe('RATE_LIMITED');
  });
});

describe('hesap silme (K-09)', () => {
  async function richUser() {
    const inst = await createInstitution(prisma);
    const me = await person();
    const other = await person();
    await addMembership(prisma, {
      userId: me.id,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2023,
    });
    await prisma.session.create({
      data: { userId: me.id, token: randomUUID(), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await prisma.account.create({
      data: { userId: me.id, providerId: 'linkedin', accountId: randomUUID() },
    });
    await recordConsents(
      prisma,
      me.id,
      [
        { documentType: 'PRIVACY_NOTICE', version: 'taslak-1', granted: true },
        { documentType: 'TERMS_OF_USE', version: 'taslak-1', granted: true },
      ],
      V1,
    );
    await setFieldVisibility(prisma, me.id, { field: 'PHONE', level: 'MEMBERS' });
    const incoming = await sendContactRequest(prisma, other.id, {
      targetUserId: me.id,
      fields: ['EMAIL'],
    });
    const outgoing = await sendContactRequest(prisma, me.id, {
      targetUserId: other.id,
      fields: ['EMAIL'],
    });
    await respondToContactRequest(prisma, other.id, {
      requestId: outgoing.requestId,
      decision: 'APPROVE',
    });
    return { inst, me, other, incoming, outgoing };
  }

  it('e-posta onayı tutmazsa hiçbir şey değişmez', async () => {
    const { me } = await richUser();
    expect(
      await errorCode(
        deleteAccount(
          prisma,
          me.id,
          { publishedContent: 'DELETE', confirmEmail: 'baska@ornek.edu.tr' },
          { removeStoredFiles: null },
        ),
      ),
    ).toBe('ACCOUNT_DELETE_CONFIRMATION_MISMATCH');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(user.deletedAt).toBeNull();
    expect(await prisma.session.count({ where: { userId: me.id } })).toBe(1);
  });

  it('kişisel alanlar boşalır, oturumlar düşer, talepler kapanır, rıza kanıt olarak kalır; silinen hesap oturum açamaz', async () => {
    const { me, other, incoming, outgoing } = await richUser();
    await deleteAccount(
      prisma,
      me.id,
      { publishedContent: 'ANONYMIZE', confirmEmail: me.email.toUpperCase() },
      { removeStoredFiles: null },
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(user).toMatchObject({
      name: DELETED_USER_NAME,
      email: deletedEmailFor(me.id),
      phone: null,
      image: null,
      emailVerified: false,
    });
    expect(user.deletedAt).not.toBeNull();
    expect(JSON.stringify(user)).not.toContain(me.email);
    expect(await prisma.user.count({ where: { email: me.email } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.account.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.fieldVisibility.count({ where: { userId: me.id } })).toBe(0);
    expect(await prisma.membership.count({ where: { userId: me.id, endedAt: null } })).toBe(0);
    expect(await prisma.consent.count({ where: { userId: me.id } })).toBe(2);
    expect(
      (await prisma.contactRequest.findUniqueOrThrow({ where: { id: incoming.requestId } })).status,
    ).toBe('REJECTED');
    expect(
      (await prisma.contactRequest.findUniqueOrThrow({ where: { id: outgoing.requestId } })).status,
    ).toBe('REVOKED');
    // Karşı tarafın kutusunda silinen kişinin e-postası yok.
    expect(
      JSON.stringify(await listContactRequests(prisma, other.id, { box: 'INCOMING', limit: 20 })),
    ).not.toContain(me.email);

    // Oturum geri gelse bile yetki katmanı silinmiş hesabı reddeder (giriş yok).
    const permissions = createPermissions({
      db: () => prisma,
      getSessionUserId: async () => me.id,
      now: () => new Date(),
    });
    expect(await errorCode(permissions.requireUser())).toBe('AUTH_UNAUTHENTICATED');
    expect(
      await errorCode(
        deleteAccount(
          prisma,
          me.id,
          { publishedContent: 'DELETE', confirmEmail: me.email },
          { removeStoredFiles: null },
        ),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
  });

  it('bekleyen belge dosyası: silme bağlı değilse işlem başlamaz; bağlıysa dosya silinir ve satır gider', async () => {
    const { inst, me } = await richUser();
    const key = `graduation/${me.id}/${randomUUID()}.pdf`;
    await prisma.graduationDocument.create({
      data: { userId: me.id, departmentId: inst.deptA1, graduationYear: 2024, storageKey: key },
    });
    await expect(
      deleteAccount(
        prisma,
        me.id,
        { publishedContent: 'DELETE', confirmEmail: me.email },
        { removeStoredFiles: null },
      ),
    ).rejects.toThrow();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).deletedAt).toBeNull();

    const removed: string[] = [];
    let handled: string | null = null;
    await deleteAccount(
      prisma,
      me.id,
      { publishedContent: 'DELETE', confirmEmail: me.email },
      {
        removeStoredFiles: async (keys) => void removed.push(...keys),
        handlers: [async (_tx, _userId, choice) => void (handled = choice)],
      },
    );
    expect(removed).toEqual([key]);
    expect(handled).toBe('DELETE');
    expect(await prisma.graduationDocument.count({ where: { userId: me.id } })).toBe(0);
  });
});

describe('veri dökümü', () => {
  it('kendi verisini sözleşme biçiminde döner; karşı tarafın iletişimi dökümde yok', async () => {
    const me = await person();
    const other = await person();
    await recordConsents(
      prisma,
      me.id,
      [{ documentType: 'PRIVACY_NOTICE', version: 'taslak-1', granted: true }],
      V1,
    );
    const { requestId } = await sendContactRequest(prisma, me.id, {
      targetUserId: other.id,
      fields: ['EMAIL'],
    });
    await respondToContactRequest(prisma, other.id, { requestId, decision: 'APPROVE' });
    await sendContactRequest(prisma, other.id, { targetUserId: me.id, fields: ['PHONE'] });

    const data = await buildDataExport(prisma, me.id);
    expect(dataExportSchema.safeParse(data).success).toBe(true);
    expect(data.user).toMatchObject({ email: me.email, phone: me.phone });
    const json = JSON.stringify(data);
    expect(json).not.toContain(other.email);
    expect(json).not.toContain(other.phone);
    expect(data.contactRequests.sent).toHaveLength(1);
    expect(data.contactRequests.received).toHaveLength(1);
  });
});

it('gerçek oturum ve yerel belge: silme hatası geri alınır; yeniden denemede dosya ve oturum yoktur', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mezun-account-'));
  try {
    const storage = createLocalStorage(root);
    const inst = await createInstitution(prisma);
    const me = await person();
    const { auth, sent } = createTestAuth(prisma);
    const { headers } = await signInWithMagicLink(auth, sent, me.email);
    expect((await auth.api.getSession({ headers }))?.user.id).toBe(me.id);
    const key = `graduation/${me.id}/${randomUUID()}.pdf`;
    await storage.put(key, new TextEncoder().encode('%PDF-1.7\n'), {
      contentType: 'application/pdf',
    });
    await prisma.graduationDocument.create({
      data: { userId: me.id, departmentId: inst.deptA1, graduationYear: 2025, storageKey: key },
    });
    const input = { publishedContent: 'DELETE' as const, confirmEmail: me.email };
    await expect(
      deleteAccount(prisma, me.id, input, {
        removeStoredFiles: async () => {
          throw new Error('depo kapalı');
        },
      }),
    ).rejects.toThrow('depo kapalı');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).deletedAt).toBeNull();
    expect(await prisma.graduationDocument.count({ where: { userId: me.id } })).toBe(1);
    expect((await auth.api.getSession({ headers }))?.user.id).toBe(me.id);
    await deleteAccount(prisma, me.id, input, {
      removeStoredFiles: async (keys) => {
        for (const k of keys) await storage.delete(k);
      },
    });
    expect(await storage.get(key)).toBeNull();
    expect(await auth.api.getSession({ headers })).toBeNull();
    expect(await prisma.session.count({ where: { userId: me.id } })).toBe(0);
    // Eski adresle yeni bağlantı, anonimleşmiş eski hesaba veya üyeliklerine bağlanamaz.
    const fresh = await signInWithMagicLink(auth, sent, me.email);
    const freshSession = await auth.api.getSession({ headers: fresh.headers });
    expect(freshSession?.user.id).toBeDefined();
    expect(freshSession?.user.id).not.toBe(me.id);
    expect(await prisma.membership.count({ where: { userId: freshSession!.user.id } })).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

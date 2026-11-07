import { afterAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

import { AuditPolicyError, recordAdminAction } from './audit';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

async function codeOf(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    if (isCodedError(error)) return error.code;
    if (error instanceof AuditPolicyError) return 'AUDIT_POLICY';
    throw error;
  }
  return 'OK';
}

describe('recordAdminAction', () => {
  it('kaydı yazar: kim, ne, hangi kayıtta, gerekçe, metadata', async () => {
    const actorId = await createUser(prisma);
    const { id } = await recordAdminAction(prisma, {
      actor: { userId: actorId },
      action: 'DOCUMENT_REJECT',
      targetType: 'USER',
      targetId: 'hedef-1',
      reason: '  Barkod doğrulanamadı.  ',
      metadata: { documentId: 'd1', attempt: 2, bulk: false },
    });

    const row = await prisma.adminAuditLog.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      actorId,
      action: 'DOCUMENT_REJECT',
      targetType: 'USER',
      targetId: 'hedef-1',
      reason: 'Barkod doğrulanamadı.',
      metadata: { documentId: 'd1', attempt: 2, bulk: false },
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('gerekçe istemeyen eylem gerekçesiz yazılır; metadata verilmezse boş nesne', async () => {
    const actorId = await createUser(prisma);
    const { id } = await recordAdminAction(prisma, {
      actor: { userId: actorId },
      action: 'DOCUMENT_APPROVE',
      targetType: 'USER',
      targetId: 'hedef-2',
    });
    const row = await prisma.adminAuditLog.findUniqueOrThrow({ where: { id } });
    expect(row.reason).toBeNull();
    expect(row.metadata).toEqual({});
  });

  it('gerekçe zorunlu eylemde gerekçesiz çağrı AUDIT_REASON_REQUIRED ile reddedilir, satır yazılmaz', async () => {
    const actorId = await createUser(prisma);
    for (const reason of [undefined, null, '', '   ']) {
      expect(
        await codeOf(
          recordAdminAction(prisma, {
            actor: { userId: actorId },
            action: 'USER_SUSPEND',
            targetType: 'USER',
            targetId: 'hedef-3',
            reason,
          }),
        ),
      ).toBe('AUDIT_REASON_REQUIRED');
    }
    expect(await prisma.adminAuditLog.count({ where: { actorId } })).toBe(0);
  });

  it('kişisel veri içeren ya da uygunsuz uzunlukta gerekçe AUDIT_REASON_INVALID ile reddedilir', async () => {
    const actorId = await createUser(prisma);
    for (const reason of [
      'ab',
      'x'.repeat(1001),
      'ayse@ogr.iu.edu.tr sahte belge',
      '0532 123 45 67 aranmalı',
    ]) {
      expect(
        await codeOf(
          recordAdminAction(prisma, {
            actor: { userId: actorId },
            action: 'DOCUMENT_REJECT',
            targetType: 'USER',
            targetId: 'hedef-4',
            reason,
          }),
        ),
      ).toBe('AUDIT_REASON_INVALID');
    }
    expect(await prisma.adminAuditLog.count({ where: { actorId } })).toBe(0);
  });

  it('kişisel veri taşıyan metadata reddedilir ve değer hata mesajına sızmaz', async () => {
    const actorId = await createUser(prisma);
    const secret = 'gizli.kisi@ogr.iu.edu.tr';
    const error = await recordAdminAction(prisma, {
      actor: { userId: actorId },
      action: 'DOCUMENT_APPROVE',
      targetType: 'USER',
      targetId: 'hedef-5',
      metadata: { note: secret, userEmail: secret },
    }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AuditPolicyError);
    expect((error as Error).message).not.toContain(secret);
    expect((error as Error).message).toContain('userEmail');
    expect(await prisma.adminAuditLog.count({ where: { actorId } })).toBe(0);
  });

  it('bilinmeyen eylem/hedef türü ve geçersiz hedef kimliği geliştirici hatasıdır', async () => {
    const actorId = await createUser(prisma);
    const base = {
      actor: { userId: actorId },
      action: 'DOCUMENT_APPROVE',
      targetType: 'USER',
      targetId: 'x',
    } as const;
    // @ts-expect-error bilinmeyen eylem adı tip düzeyinde de reddedilir
    expect(await codeOf(recordAdminAction(prisma, { ...base, action: 'DROP_ALL' }))).toBe(
      'AUDIT_POLICY',
    );
    // @ts-expect-error bilinmeyen hedef türü tip düzeyinde de reddedilir
    expect(await codeOf(recordAdminAction(prisma, { ...base, targetType: 'WHATEVER' }))).toBe(
      'AUDIT_POLICY',
    );
    expect(await codeOf(recordAdminAction(prisma, { ...base, targetId: '  ' }))).toBe(
      'AUDIT_POLICY',
    );
    expect(await prisma.adminAuditLog.count({ where: { actorId } })).toBe(0);
  });

  it('var olmayan yönetici (FK) yazılamaz', async () => {
    await expect(
      recordAdminAction(prisma, {
        actor: { userId: 'yok-yok' },
        action: 'DOCUMENT_APPROVE',
        targetType: 'USER',
        targetId: 'x',
      }),
    ).rejects.toThrow();
  });

  it('eylemle AYNI işlemde yazılır: işlem geri alınırsa kayıt da geri alınır, kayıt hatası eylemi de geri alır', async () => {
    const actorId = await createUser(prisma);
    const marker = await createUser(prisma, { name: 'ilk ad' });

    // 1) işlem sonradan başarısız → kayıt kalmaz
    await expect(
      prisma.$transaction(async (tx) => {
        await recordAdminAction(tx, {
          actor: { userId: actorId },
          action: 'DOCUMENT_APPROVE',
          targetType: 'USER',
          targetId: 'atomik-1',
        });
        throw new Error('sonradan hata');
      }),
    ).rejects.toThrow('sonradan hata');
    expect(await prisma.adminAuditLog.count({ where: { actorId } })).toBe(0);

    // 2) kayıt reddedilirse (gerekçe eksik) aynı işlemdeki eylem de geri alınır
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: marker }, data: { name: 'değişti' } });
        await recordAdminAction(tx, {
          actor: { userId: actorId },
          action: 'USER_SUSPEND',
          targetType: 'USER',
          targetId: marker,
        });
      }),
    ).rejects.toMatchObject({ code: 'AUDIT_REASON_REQUIRED' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: marker } })).name).toBe('ilk ad');
  });
});

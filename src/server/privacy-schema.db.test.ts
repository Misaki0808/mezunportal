import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

async function expectDbReject(operation: Promise<unknown>, needle: string) {
  const error = await operation.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, `${needle} ihlali bekleniyordu`).not.toBeNull();
  expect(String((error as Error).message) + JSON.stringify(error)).toContain(needle);
}

describe('Consent (yalnız eklenir)', () => {
  it('eklenir; güncelleme ve silme veritabanında reddedilir', async () => {
    const userId = await createUser(prisma);
    const consent = await prisma.consent.create({
      data: { userId, documentType: 'PRIVACY_NOTICE', version: 'taslak-1', granted: true },
    });
    await expectDbReject(
      prisma.consent.update({ where: { id: consent.id }, data: { granted: false } }),
      'yalnız eklenir',
    );
    await expectDbReject(prisma.consent.delete({ where: { id: consent.id } }), 'yalnız eklenir');
    // geri çekme yeni satırdır
    await prisma.consent.create({
      data: { userId, documentType: 'CROSS_BORDER_TRANSFER', version: 'taslak-1', granted: false },
    });
    expect(await prisma.consent.count({ where: { userId } })).toBe(2);
  });

  it('sürüm etiketi biçimli olmalı', async () => {
    const userId = await createUser(prisma);
    await expectDbReject(
      prisma.consent.create({
        data: { userId, documentType: 'TERMS_OF_USE', version: 'Taslak 1', granted: true },
      }),
      'Consent_version_check',
    );
  });

  it('rızası olan kullanıcı satırı silinemez (rıza hukuki kanıttır; hesap silme anonimleştirir)', async () => {
    const userId = await createUser(prisma);
    await prisma.consent.create({
      data: { userId, documentType: 'TERMS_OF_USE', version: 'taslak-1', granted: true },
    });
    await expect(prisma.user.delete({ where: { id: userId } })).rejects.toThrow();
  });
});

describe('FieldVisibility', () => {
  it('kullanıcı × alan başına tek satır', async () => {
    const userId = await createUser(prisma);
    await prisma.fieldVisibility.create({ data: { userId, field: 'EMAIL', level: 'PRIVATE' } });
    await expectDbReject(
      prisma.fieldVisibility.create({ data: { userId, field: 'EMAIL', level: 'MEMBERS' } }),
      'FieldVisibility_userId_field_key',
    );
    await prisma.fieldVisibility.create({ data: { userId, field: 'PHONE', level: 'MEMBERS' } });
  });
});

describe('ContactRequest', () => {
  async function pair() {
    return { requesterId: await createUser(prisma), targetId: await createUser(prisma) };
  }

  it('kendine talep, boş alan listesi, tekrarlı alan ve 500 karakteri aşan not reddedilir', async () => {
    const { requesterId, targetId } = await pair();
    await expectDbReject(
      prisma.contactRequest.create({
        data: { requesterId, targetId: requesterId, fields: ['EMAIL'] },
      }),
      'ContactRequest_shape_check',
    );
    await expectDbReject(
      prisma.contactRequest.create({ data: { requesterId, targetId, fields: [] } }),
      'ContactRequest_shape_check',
    );
    await expectDbReject(
      prisma.contactRequest.create({ data: { requesterId, targetId, fields: ['EMAIL', 'EMAIL'] } }),
      'ContactRequest_fields_distinct_check',
    );
    await expectDbReject(
      prisma.contactRequest.create({
        data: { requesterId, targetId, fields: ['PHONE'], message: 'a'.repeat(501) },
      }),
      'ContactRequest_shape_check',
    );
  });

  it('aynı ikili ve kaynak bağlamı için tek açık talep; kapanınca yenisi açılabilir', async () => {
    const { requesterId, targetId } = await pair();
    const first = await prisma.contactRequest.create({
      data: { requesterId, targetId, fields: ['EMAIL'] },
    });
    await expectDbReject(
      prisma.contactRequest.create({ data: { requesterId, targetId, fields: ['PHONE'] } }),
      'ContactRequest_open_context_key',
    );
    // ters yön ayrı ikilidir
    await prisma.contactRequest.create({
      data: { requesterId: targetId, targetId: requesterId, fields: ['EMAIL'] },
    });
    await prisma.contactRequest.update({
      where: { id: first.id },
      data: { status: 'REJECTED', decidedAt: new Date() },
    });
    await prisma.contactRequest.create({ data: { requesterId, targetId, fields: ['PHONE'] } });
  });

  it('aynı bağlamda onaylı talep de açıktır: yeni talep açılamaz, geri alınınca açılabilir', async () => {
    const { requesterId, targetId } = await pair();
    const request = await prisma.contactRequest.create({
      data: { requesterId, targetId, fields: ['EMAIL'], status: 'APPROVED', decidedAt: new Date() },
    });
    await expectDbReject(
      prisma.contactRequest.create({ data: { requesterId, targetId, fields: ['PHONE'] } }),
      'ContactRequest_open_context_key',
    );
    await prisma.contactRequest.update({
      where: { id: request.id },
      data: { status: 'REVOKED', closedAt: new Date() },
    });
    await prisma.contactRequest.create({ data: { requesterId, targetId, fields: ['PHONE'] } });
  });

  it.each([
    [{ status: 'PENDING', decidedAt: new Date() }],
    [{ status: 'APPROVED' }],
    [{ status: 'REJECTED' }],
    [{ status: 'REVOKED', decidedAt: new Date() }],
    [{ status: 'WITHDRAWN' }],
    [{ status: 'WITHDRAWN', closedAt: new Date(), decidedAt: new Date() }],
    [{ status: 'APPROVED', decidedAt: new Date(), closedAt: new Date() }],
  ] as const)('durum ↔ tarih tutarsızlığı reddedilir: %j', async (shape) => {
    const { requesterId, targetId } = await pair();
    await expectDbReject(
      prisma.contactRequest.create({
        data: { requesterId, targetId, fields: ['EMAIL'], ...shape },
      }),
      'ContactRequest_shape_check',
    );
  });

  it('tutarlı durumlar yazılır', async () => {
    for (const shape of [
      { status: 'PENDING' as const },
      { status: 'APPROVED' as const, decidedAt: new Date() },
      { status: 'WITHDRAWN' as const, closedAt: new Date() },
      { status: 'REVOKED' as const, decidedAt: new Date(), closedAt: new Date() },
    ]) {
      const { requesterId, targetId } = await pair();
      await prisma.contactRequest.create({
        data: { requesterId, targetId, fields: ['EMAIL'], ...shape },
      });
    }
  });
});

it('alan listesi NULL veya çok boyutlu olamaz; CHECK üç değerli SQL ile aşılamaz', async () => {
  const requesterId = await createUser(prisma),
    targetId = await createUser(prisma);
  await expectDbReject(
    prisma.$executeRaw`INSERT INTO "ContactRequest" (id,"requesterId","targetId",fields,"updatedAt") VALUES ('null-probe',${requesterId},${targetId},NULL,now())`,
    'ContactRequest_fields_shape_check',
  );
  await expectDbReject(
    prisma.$executeRaw`INSERT INTO "ContactRequest" (id,"requesterId","targetId",fields,"updatedAt") VALUES ('dim-probe',${requesterId},${targetId},ARRAY[['EMAIL'],['PHONE']]::"ContactField"[],now())`,
    'ContactRequest_fields_shape_check',
  );
});

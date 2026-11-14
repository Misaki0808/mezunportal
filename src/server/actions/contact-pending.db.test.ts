import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
const session = vi.hoisted(() => ({ userId: '' }));
vi.mock('../db', () => ({ getDb: () => db }));
vi.mock('../permissions/session', () => ({ getSessionUserId: async () => session.userId }));
const db = createTestPrisma();
import { previewContactTarget } from './contact-request';
let viewer: string, target: string, foreign: string, otherSource: string;
beforeAll(async () => {
  const a = await createInstitution(db),
    b = await createInstitution(db);
  viewer = await createUser(db);
  target = await createUser(db);
  foreign = await createUser(db);
  otherSource = await createUser(db);
  for (const [userId, departmentId] of [
    [viewer, a.deptA1],
    [target, a.deptA2],
    [foreign, b.deptA1],
    [otherSource, a.deptA1],
  ])
    await addMembership(db, { userId: userId!, departmentId: departmentId!, role: 'STUDENT' });
  await grantRequiredConsents(db, viewer);
  session.userId = viewer;
  await db.contactRequest.createMany({
    data: [
      { requesterId: viewer, targetId: target, fields: ['EMAIL'] },
      { requesterId: viewer, targetId: foreign, fields: ['EMAIL'] },
      {
        requesterId: viewer,
        targetId: otherSource,
        source: 'SEEKER_PROFILE',
        sourceTitle: 'Örnek aday',
        sourceOrganization: 'Örnek bölüm',
        fields: ['EMAIL'],
      },
    ],
  });
});
afterAll(() => db.$disconnect());
it('uygun hedefte yalnız aynı PROFILE bağlamının bekleyen isteği gösterilir; kimlik/yük taşınmaz', async () => {
  const preview = await previewContactTarget({ targetUserId: target });
  expect(preview).toMatchObject({ ok: true, data: { canRequest: true, pendingRequest: true } });
  if (preview.ok && preview.data.canRequest)
    expect(Object.keys(preview.data).sort()).toEqual([
      'canRequest',
      'displayName',
      'pendingRequest',
      'requestableFields',
    ]);
  expect(await previewContactTarget({ targetUserId: otherSource })).toMatchObject({
    ok: true,
    data: { canRequest: true, pendingRequest: false },
  });
});
it('yabancı hedefte mevcut bekleyen kayıt dahi yok ile aynı yanıtı verir; sayaç her iki yolda işler, yeni satır yazılmaz', async () => {
  const rows = await db.contactRequest.count({ where: { requesterId: viewer } });
  const key = `app:contact-preview:${viewer}`;
  const before = (await db.rateLimit.findUnique({ where: { key } }))?.count ?? 0;
  const missing = await previewContactTarget({ targetUserId: randomUUID() });
  expect(await previewContactTarget({ targetUserId: foreign })).toEqual(missing);
  expect(missing).toEqual({
    ok: true,
    data: { canRequest: false, displayName: null, requestableFields: [] },
  });
  expect((await db.rateLimit.findUniqueOrThrow({ where: { key } })).count).toBe(before + 2);
  expect(await db.contactRequest.count({ where: { requesterId: viewer } })).toBe(rows);
});
it('talep kapanınca bekleme uyarısı kalkar; ters yön ve başka isteyenin talebi uyarı açmaz', async () => {
  await db.contactRequest.updateMany({
    where: { requesterId: viewer, targetId: target },
    data: { status: 'REJECTED', decidedAt: new Date() },
  });
  await db.contactRequest.create({
    data: { requesterId: target, targetId: viewer, fields: ['EMAIL'] },
  });
  expect(await previewContactTarget({ targetUserId: target })).toMatchObject({
    ok: true,
    data: { pendingRequest: false },
  });
});

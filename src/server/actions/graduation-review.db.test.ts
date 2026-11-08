import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { addGrant, addMembership, createInstitution, createUser } from '@/test/fixtures';

const session = vi.hoisted(() => ({ userId: '' }));
vi.mock('../permissions/session', () => ({ getSessionUserId: async () => session.userId }));
vi.mock('../db', () => ({ getDb: () => db }));
vi.mock('@/server/external/storage', () => ({ getStorage: () => ({}) }));
vi.mock('./deps', () => ({
  documentDeps: () => ({ db, storage: {}, secret: 'review-test-secret' }),
}));
import { listPendingGraduationDocuments, reviewGraduationDocument } from './graduation-document';
import { GET } from '@/app/api/graduation-documents/[id]/file/route';
const db = createTestPrisma();
let documentId: string;
beforeAll(async () => {
  const { deptA1 } = await createInstitution(db);
  session.userId = await createUser(db);
  await addMembership(db, { userId: session.userId, departmentId: deptA1, role: 'ACADEMIC' });
  await addGrant(db, { userId: session.userId, scope: 'DEPARTMENT', departmentId: deptA1 });
  const applicant = await createUser(db);
  const document = await db.graduationDocument.create({
    data: {
      userId: applicant,
      departmentId: deptA1,
      graduationYear: 2024,
      storageKey: 'graduation/test/test.pdf',
    },
  });
  documentId = document.id;
});
afterAll(() => db.$disconnect());
it('rızasız yetkili gerçek sunucu eylemlerini doğrudan çağırsa kuyruk ve karar reddedilir', async () => {
  expect(await listPendingGraduationDocuments()).toMatchObject({
    ok: false,
    errorCode: 'CONSENT_REQUIRED',
  });
  expect(await reviewGraduationDocument({ documentId, decision: 'APPROVE' })).toMatchObject({
    ok: false,
    errorCode: 'CONSENT_REQUIRED',
  });
  const file = await GET(new Request('http://test.local'), {
    params: Promise.resolve({ id: documentId }),
  });
  expect(file.status).toBe(404);
  expect(
    (await db.graduationDocument.findUniqueOrThrow({ where: { id: documentId } })).status,
  ).toBe('PENDING');
});

import { afterAll, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { buildDataExport } from '../services/dataExport';
const session = vi.hoisted(() => ({ userId: '' }));
vi.mock('../db', () => ({ getDb: () => db }));
vi.mock('../permissions/session', () => ({ getSessionUserId: async () => session.userId }));
const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('mezun tercihini yalnız kendisi açıp kapatır, öğrenci doğrudan açamaz', async () => {
  const school = await createInstitution(db);
  const alumni = await createUser(db);
  const student = await createUser(db);
  await addMembership(db, {
    userId: alumni,
    departmentId: school.deptA1,
    role: 'ALUMNI',
    graduationYear: 2020,
  });
  await addMembership(db, {
    userId: student,
    departmentId: school.deptA1,
    role: 'STUDENT',
    entryYear: 2022,
  });
  await grantRequiredConsents(db, alumni);
  await grantRequiredConsents(db, student);
  const actions = await import('./alumni-directory');
  session.userId = alumni;
  expect(await actions.getAlumniVisibility()).toMatchObject({
    ok: true,
    data: { visible: false, eligible: true },
  });
  expect(await actions.setAlumniVisibility({ visible: true })).toMatchObject({
    ok: true,
    data: { visible: true },
  });
  expect(
    (await db.profile.findUniqueOrThrow({ where: { userId: alumni } })).alumniDirectoryVisible,
  ).toBe(true);
  expect((await buildDataExport(db, alumni)).profile?.alumniDirectoryVisible).toBe(true);
  expect(await actions.setAlumniVisibility({ visible: false })).toMatchObject({
    ok: true,
    data: { visible: false },
  });
  session.userId = student;
  expect(await actions.setAlumniVisibility({ visible: true })).toMatchObject({
    ok: false,
    errorCode: 'AUTH_FORBIDDEN',
  });
  expect(
    (await db.profile.findUnique({ where: { userId: student } }))?.alumniDirectoryVisible ?? false,
  ).toBe(false);
});

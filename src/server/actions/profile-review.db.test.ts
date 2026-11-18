import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';

const actor = vi.hoisted(() => ({ userId: '' }));
vi.mock('../permissions/session', () => ({ getSessionUserId: async () => actor.userId }));
vi.mock('../db', () => ({ getDb: () => db }));
import { saveOnboardingStep } from './profile';
import { saveProfileEntry } from './profile-content';

const db = createTestPrisma();
let departmentId: string;
beforeAll(async () => {
  departmentId = (await createInstitution(db)).deptA1;
});
afterAll(() => db.$disconnect());

it('istemci rol ve deneyim uydursa da doğrudan eylem K-08 eşiğini sunucuda uygular', async () => {
  actor.userId = await createUser(db);
  await grantRequiredConsents(db, actor.userId);
  await addMembership(db, {
    userId: actor.userId,
    departmentId,
    role: 'STUDENT',
    entryYear: new Date().getFullYear(),
    status: 'PENDING',
  });
  for (const interested of [true, false]) {
    expect(
      await saveOnboardingStep({
        step: 'MENTOR_PREFERENCE',
        interested,
        role: 'ALUMNI',
        grade: 4,
        publishedExperienceCount: 99,
      } as never),
    ).toEqual({ ok: false, errorCode: 'MENTOR_NOT_ELIGIBLE' });
  }
  expect(await db.mentorProfile.count({ where: { userId: actor.userId } })).toBe(0);
  expect(await db.profile.findUnique({ where: { userId: actor.userId } })).toBeNull();
});

it('elle iş açıklaması sınırı aşarsa eylem reddeder ve var olan kayıt değişmez', async () => {
  actor.userId = await createUser(db);
  await grantRequiredConsents(db, actor.userId);
  await addMembership(db, { userId: actor.userId, departmentId, role: 'STUDENT', entryYear: 2024 });
  const values = { company: 'Örnek', title: 'Analist', description: 'a'.repeat(1000) };
  const created = await saveProfileEntry({ section: 'POSITION', values });
  expect(created.ok).toBe(true);
  const existing = await db.position.findFirstOrThrow({ where: { userId: actor.userId } });
  expect(existing.description).toBe(values.description);
  const rejected = await saveProfileEntry({
    section: 'POSITION',
    id: existing.id,
    values: { ...values, description: `${values.description}b` },
  });
  expect(rejected).toMatchObject({
    ok: false,
    errorCode: 'VALIDATION_INVALID',
    fieldErrors: { 'values.description': 'VALIDATION_INVALID' },
  });
  expect((await db.position.findUniqueOrThrow({ where: { id: existing.id } })).description).toBe(
    values.description,
  );
});

import { afterAll, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  addMentorProfile,
  createInstitution,
  createUser,
} from '@/test/fixtures';
import { accountStatusOf } from '../rules/authorization';
import { loadActor } from './actor';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

it('sıralı aktör okumaları eski ilişkili sorguyla aynı etkin olguları ve hesap durumunu döndürür', async () => {
  const institution = await createInstitution(db);
  const userId = await createUser(db, { banned: true, banExpires: new Date('2027-01-01') });
  await addMembership(db, { userId, departmentId: institution.deptA1, role: 'STUDENT' });
  await addMembership(db, {
    userId,
    departmentId: institution.deptA2,
    role: 'STUDENT',
    endedAt: new Date('2025-01-01'),
  });
  await addGrant(db, { userId, scope: 'DEPARTMENT', departmentId: institution.deptA1 });
  await addGrant(db, {
    userId,
    scope: 'DEPARTMENT',
    departmentId: institution.deptA2,
    revoked: true,
  });
  await addMentorProfile(db, userId, { isActive: true });
  const now = new Date('2026-11-17T00:00:00Z');
  const old = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      banned: true,
      banExpires: true,
      deletedAt: true,
      memberships: {
        where: { endedAt: null },
        select: {
          id: true,
          departmentId: true,
          role: true,
          verificationStatus: true,
          endedAt: true,
          entryYear: true,
          classOffset: true,
        },
      },
      adminGrants: {
        where: { revokedAt: null },
        select: { id: true, scope: true, facultyId: true, departmentId: true, revokedAt: true },
      },
      mentorProfile: { select: { isActive: true } },
    },
  });
  const actual = await db.$transaction((tx) => loadActor(tx, userId, now));
  expect(actual).toEqual({
    userId,
    facts: {
      accountStatus: accountStatusOf(old, now),
      memberships: old.memberships,
      grants: old.adminGrants,
      mentor: old.mentorProfile,
    },
  });
  expect(actual?.facts.memberships).toHaveLength(1);
  expect(actual?.facts.grants).toHaveLength(1);
  expect(await loadActor(db, '00000000-0000-0000-0000-000000000000', now)).toBeNull();
});

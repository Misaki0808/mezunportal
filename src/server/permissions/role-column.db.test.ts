import { afterAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser } from '@/test/fixtures';

import { createPermissions } from './guards';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

// Better Auth admin eklentisi `User.role` sütununu ister (P1-02). Yetki kararı bu sütundan ASLA
// verilmez: yetki yalnız Membership ve AdminGrant'tandır.
describe('User.role yetki vermez', () => {
  it.each(['admin', 'ADMIN', 'superadmin', 'user'])(
    'role = %j olan doğrulanmış üye yönetici işlemi yapamaz',
    async (role) => {
      const inst = await createInstitution(prisma);
      const userId = await createUser(prisma);
      await addMembership(prisma, { userId, departmentId: inst.deptA1, role: 'ACADEMIC' });
      await prisma.user.update({ where: { id: userId }, data: { role } });

      const permissions = createPermissions({
        db: () => prisma,
        getSessionUserId: async () => userId,
        now: () => new Date(),
      });

      for (const guard of [
        () => permissions.requireAdmin({ kind: 'SYSTEM' }),
        () => permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: inst.deptA1 }),
        () => permissions.requireModerator(inst.deptA1),
        () => permissions.requireMentor(),
      ]) {
        const error = await guard().then(
          () => null,
          (caught: unknown) => caught,
        );
        expect(isCodedError(error) && error.code).toBe('AUTH_FORBIDDEN');
      }
      const actor = await permissions.requireUser();
      expect(actor.facts.grants).toEqual([]);
      // Olgular yalnız üyelik/yetki/mentor taşır; User.role hiçbir yerde okunmaz.
      expect(Object.keys(actor.facts).sort()).toEqual([
        'accountStatus',
        'grants',
        'memberships',
        'mentor',
      ]);
    },
  );
});

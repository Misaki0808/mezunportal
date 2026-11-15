import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { addMembership, createInstitution, createUser } from '@/test/fixtures';

import { getShellUser } from './shell-user';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const now = new Date('2031-05-10T12:00:00Z');
const deps = { db, now: () => now };

describe('getShellUser: yan menü alt kartı', () => {
  it('doğrulanmış etkin öğrenci üyeliğinden bölüm kodu ve sınıf gelir; yalnız ad ve üyelik döner', async () => {
    const inst = await createInstitution(db);
    const userId = await createUser(db, { name: 'Deniz Aksoy' });
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2028,
    });
    const code = (await db.department.findUniqueOrThrow({ where: { id: inst.deptA1 } })).code;
    const card = await getShellUser(deps, userId);
    expect(card).toEqual({
      name: 'Deniz Aksoy',
      membership: { departmentCode: code, standing: 'GRADE', grade: 3 },
    });
    // E-posta, telefon ve görsel adresi karta taşınmaz.
    expect(JSON.stringify(card)).not.toMatch(/@|phone|image/);
  });

  it('mezun kartı rol yazar', async () => {
    const inst = await createInstitution(db);
    const userId = await createUser(db, { name: 'Mert Yıldız' });
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'ALUMNI',
      graduationYear: 2020,
    });
    expect((await getShellUser(deps, userId))?.membership?.standing).toBe('ALUMNI');
  });

  it('üyelik yoksa, beklemedeyse ya da bitmişse kartta yalnız ad vardır (satır uydurulmaz)', async () => {
    const inst = await createInstitution(db);
    const none = await createUser(db, { name: 'Üyeliksiz' });
    expect(await getShellUser(deps, none)).toEqual({ name: 'Üyeliksiz', membership: null });

    const pending = await createUser(db, { name: 'Bekleyen' });
    await addMembership(db, {
      userId: pending,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      status: 'PENDING',
      entryYear: 2028,
    });
    expect((await getShellUser(deps, pending))?.membership).toBeNull();

    const ended = await createUser(db, { name: 'Biten' });
    await addMembership(db, {
      userId: ended,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      endedAt: new Date('2030-01-01T00:00:00Z'),
      entryYear: 2028,
    });
    expect((await getShellUser(deps, ended))?.membership).toBeNull();
  });

  it('silinmiş ya da olmayan kullanıcı için kart yoktur', async () => {
    const deleted = await createUser(db, { name: 'Silinen', deletedAt: new Date('2031-01-01') });
    expect(await getShellUser(deps, deleted)).toBeNull();
    expect(await getShellUser(deps, '00000000-0000-7000-8000-000000000000')).toBeNull();
  });
});

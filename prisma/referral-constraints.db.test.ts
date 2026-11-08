import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { createInstitution, createUser } from '@/test/fixtures';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('referans kendine verilemez; not uzunluğu ve onay sırası veritabanında da zorlanır', async () => {
  const inst = await createInstitution(db);
  const alumnusId = await createUser(db);
  const studentId = await createUser(db);
  const base = {
    alumnusId,
    studentId,
    departmentIdAtWrite: inst.deptA1,
    organizationName: 'Kurum',
  };
  await expect(
    db.referralClaim.create({ data: { ...base, studentId: alumnusId } }),
  ).rejects.toThrow();
  await expect(
    db.referralClaim.create({ data: { ...base, note: 'x'.repeat(501) } }),
  ).rejects.toThrow();
  await expect(
    db.referralClaim.create({ data: { ...base, status: 'APPROVED', approvedAt: new Date() } }),
  ).rejects.toThrow();
  const proposed = await db.referralClaim.create({ data: base });
  await expect(
    db.referralClaim.update({
      where: { id: proposed.id },
      data: { status: 'ACCEPTED_APPROVED', approvedAt: new Date() },
    }),
  ).rejects.toThrow();
  await expect(
    db.referralClaim.update({
      where: { id: proposed.id },
      data: { status: 'STUDENT_CONFIRMED', studentConfirmedAt: new Date() },
    }),
  ).resolves.toMatchObject({ status: 'STUDENT_CONFIRMED' });
});

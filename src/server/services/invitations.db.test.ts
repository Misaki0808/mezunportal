import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { inviteUsers, parseInvitations } from './invitations';
import { maySendNotification } from './notification-preferences';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const options = () => ({
  db,
  secret: 'test-secret-with-at-least-32-characters',
  appUrl: 'http://localhost:3000',
  enqueue: vi.fn().mockResolvedValue({ emailLogId: 'queued' }),
});

describe('toplu davet', () => {
  it('listeyi doğrular, tekrarları kaldırır ve sınırı uygular', () => {
    expect(
      parseInvitations('email\nA@example.invalid, a@example.invalid; b@example.invalid'),
    ).toEqual(['a@example.invalid', 'b@example.invalid']);
    expect(() => parseInvitations('a@example.invalid yanlis')).toThrow();
    expect(() => parseInvitations(Array(101).fill('a@example.invalid').join('\n'))).toThrow();
  });
  it('yalnız rızalı sistem yöneticisi gönderebilir; kayıt ve tekrar kişisel veri içermez', async () => {
    const institution = await createInstitution(db);
    const admin = await createUser(db);
    await addMembership(db, { userId: admin, departmentId: institution.deptA1, role: 'ACADEMIC' });
    await addGrant(db, { userId: admin, scope: 'SYSTEM' });
    const deps = options();
    await expect(inviteUsers(deps, admin, 'first@example.invalid')).rejects.toThrow();
    await grantRequiredConsents(db, admin);
    const noAdmin = await createUser(db);
    await expect(inviteUsers(deps, noAdmin, 'first@example.invalid')).rejects.toThrow();
    expect(deps.enqueue).not.toHaveBeenCalled();
    const existing = `${randomUUID()}@example.invalid`;
    await createUser(db, { email: existing });
    const fresh = `${randomUUID()}@example.invalid`;
    const result = await inviteUsers(deps, admin, `${fresh}\n${fresh.toUpperCase()}\n${existing}`);
    expect(result).toEqual({ queued: 1, skipped: 1, failed: 0 });
    expect(deps.enqueue).toHaveBeenCalledTimes(1);
    const sent = deps.enqueue.mock.calls[0]![0];
    expect(sent.idempotencyKey).not.toContain(fresh);
    expect(await maySendNotification(db, sent)).toBe(true);
    expect(await maySendNotification(db, { ...sent, to: existing })).toBe(false);
    expect(await maySendNotification(db, { ...sent, recipientUserId: admin })).toBe(false);
    const audit = await db.adminAuditLog.findFirstOrThrow({
      where: { actorId: admin, action: 'BULK_INVITATION' },
    });
    expect(JSON.stringify(audit)).not.toContain(fresh);
    deps.enqueue.mockRejectedValue(new Error('down'));
    expect((await inviteUsers(deps, admin, `${randomUUID()}@example.invalid`)).failed).toBe(1);
    for (let i = 0; i < 3; i++) await inviteUsers(deps, admin, `${randomUUID()}@example.invalid`);
    await expect(inviteUsers(deps, admin, `${randomUUID()}@example.invalid`)).rejects.toThrow();
  });
});

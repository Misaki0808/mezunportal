import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { inviteUsers, parseInvitations } from './invitations';
import {
  notificationIntentPayload,
  openPilotInvitation,
  stagePilotInvitation,
} from './notification-intent';
import { maySendNotification } from './notification-preferences';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const secret = 'test-secret-with-at-least-32-characters';
const deps = { db, secret };
describe('toplu davet', () => {
  it('listeyi doğrular, tekrarları kaldırır ve sınırı uygular', () => {
    expect(
      parseInvitations('email\nA@example.invalid, a@example.invalid; b@example.invalid'),
    ).toEqual(['a@example.invalid', 'b@example.invalid']);
    expect(() => parseInvitations('a@example.invalid yanlis')).toThrow();
    expect(() => parseInvitations(Array(101).fill('a@example.invalid').join('\n'))).toThrow();
  });
  it('yetki ve rıza uygular; adres şifreli niyette, işlem kaydıyla aynı transaction içinde kalır', async () => {
    const institution = await createInstitution(db);
    const admin = await createUser(db);
    await addMembership(db, { userId: admin, departmentId: institution.deptA1, role: 'ACADEMIC' });
    await addGrant(db, { userId: admin, scope: 'SYSTEM' });
    await expect(inviteUsers(deps, admin, 'first@example.invalid')).rejects.toThrow();
    expect(await db.notificationIntent.count({ where: { userId: admin } })).toBe(0);
    await grantRequiredConsents(db, admin);
    const noAdmin = await createUser(db);
    await expect(inviteUsers(deps, noAdmin, 'first@example.invalid')).rejects.toThrow();
    const existing = `${randomUUID()}@example.invalid`;
    await createUser(db, { email: existing });
    const fresh = `${randomUUID()}@example.invalid`;
    expect(await inviteUsers(deps, admin, `${fresh}\n${fresh.toUpperCase()}\n${existing}`)).toEqual(
      { queued: 1, skipped: 1 },
    );
    const intent = await db.notificationIntent.findFirstOrThrow({ where: { userId: admin } });
    expect(JSON.stringify(intent)).not.toContain(fresh);
    const payload = notificationIntentPayload.parse(intent.payload);
    expect(payload.type).toBe('pilotInvitation');
    if (payload.type !== 'pilotInvitation') throw new Error('expected invitation');
    expect(openPilotInvitation(payload, admin, secret)).toBe(fresh);
    expect(() => openPilotInvitation(payload, admin, 'wrong-secret')).toThrow();
    expect(() => openPilotInvitation(payload, noAdmin, secret)).toThrow();
    const sent = {
      to: fresh,
      subject: 'Örnek',
      text: 'Örnek',
      template: 'pilot.invitation',
      idempotencyKey: payload.invitationId,
    };
    expect(await maySendNotification(db, sent)).toBe(true);
    expect(await maySendNotification(db, { ...sent, to: existing })).toBe(false);
    expect(await maySendNotification(db, { ...sent, recipientUserId: admin })).toBe(false);
    const audit = await db.adminAuditLog.findFirstOrThrow({
      where: { actorId: admin, action: 'BULK_INVITATION' },
    });
    expect(JSON.stringify(audit)).not.toContain(fresh);
    const before = await db.notificationIntent.count({ where: { userId: admin } });
    await expect(
      db.$transaction(async (tx) => {
        await stagePilotInvitation(tx, admin, 'rollback@example.invalid', secret);
        throw new Error('rollback');
      }),
    ).rejects.toThrow();
    expect(await db.notificationIntent.count({ where: { userId: admin } })).toBe(before);
    for (let i = 0; i < 4; i++) await inviteUsers(deps, admin, `${randomUUID()}@example.invalid`);
    await expect(inviteUsers(deps, admin, `${randomUUID()}@example.invalid`)).rejects.toThrow();
  });
});

import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

const state = vi.hoisted(() => ({ db: null as unknown, actorId: '' }));
vi.mock('@/server/db', () => ({ getDb: () => state.db }));
vi.mock('@/server/permissions', () => ({
  requireUser: async () => ({ userId: state.actorId }),
  requireUserWithoutConsent: async () => ({ userId: state.actorId }),
  requireVerifiedMember: async () => ({ userId: state.actorId }),
}));

import { GET } from '@/app/api/hesabim/veri-dokumu/route';
import * as contacts from './contact-request';
import * as privacy from './privacy';

const db = createTestPrisma();
state.db = db;
afterAll(() => db.$disconnect());

it('eylem ve indirme yanıtlarında karşı tarafın gizli verisi yoktur', async () => {
  const actor = await createUser(db);
  const other = await createUser(db);
  const outsider = await createUser(db);
  const secretEmail = `test-${randomUUID()}@example.test`;
  const secretPhone = `+90${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const ownEmail = `test-${randomUUID()}@example.test`;
  const ownPhone = `+91${Date.now()}${Math.floor(Math.random() * 10000)}`;
  await db.user.update({ where: { id: actor }, data: { email: ownEmail, phone: ownPhone } });
  await db.user.update({ where: { id: other }, data: { email: secretEmail, phone: secretPhone } });
  state.actorId = actor;
  const check = (response: unknown, allowedEmail = false) => {
    const body = JSON.stringify(response);
    if (!allowedEmail) expect(body).not.toContain(secretEmail);
    expect(body).not.toContain(secretPhone);
  };
  check(await privacy.getConsentState());
  check(
    await privacy.recordConsents({
      decisions: [{ documentType: 'TERMS_OF_USE', version: 'taslak-1', granted: true }],
    }),
  );
  check(await privacy.getFieldVisibility());
  check(await privacy.setFieldVisibility({ field: 'PHONE', level: 'PRIVATE' }));
  const sent = await contacts.sendContactRequest({ targetUserId: other, fields: ['EMAIL'] });
  check(sent);
  if (!sent.ok) throw new Error('Test talebi oluşturulamadı');
  const requestId = sent.data.requestId;
  check(await contacts.listContactRequests({ box: 'OUTGOING' }));
  state.actorId = other;
  const incoming = await contacts.listContactRequests({ box: 'INCOMING' });
  check(incoming);
  expect(JSON.stringify(incoming)).not.toContain(ownEmail);
  expect(JSON.stringify(incoming)).not.toContain(ownPhone);
  check(await contacts.respondToContactRequest({ requestId, decision: 'APPROVE' }));
  state.actorId = actor;
  const approved = await contacts.listContactRequests({ box: 'OUTGOING' });
  check(approved, true);
  expect(JSON.stringify(approved)).toContain(secretEmail);
  const exported = await GET();
  expect(exported.status).toBe(200);
  check(await exported.json());
  state.actorId = outsider;
  check(await contacts.listContactRequests({ box: 'INCOMING' }));
  check(await contacts.listContactRequests({ box: 'OUTGOING' }));
  state.actorId = other;
  check(await contacts.revokeContactRequest({ requestId }));
  state.actorId = actor;
  check(await contacts.listContactRequests({ box: 'OUTGOING' }));
  const second = await contacts.sendContactRequest({ targetUserId: other, fields: ['EMAIL'] });
  check(second);
  if (!second.ok) throw new Error('İkinci test talebi oluşturulamadı');
  check(await contacts.withdrawContactRequest({ requestId: second.data.requestId }));
  check(await privacy.deleteAccount({ confirmEmail: ownEmail }));
});

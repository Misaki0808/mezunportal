import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addMembership,
  addMentorProfile,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('../db', () => ({ getDb: () => db }));
vi.mock('../permissions/session', () => ({ getSessionUserId: async () => session.userId }));
const db = createTestPrisma();
import { previewContactTarget, sendContactRequest } from './contact-request';
import { getProfile } from '../services/profile-content';
import { getAvailability, createRequest as createCvReview } from '../services/cv-review-request';
import { listSlots, requestAppointment } from '../services/appointment';
import { createRecordingNotifier } from '../services/appointment-notifier';
import { getMentorEntryPoints } from '../services/mentor-directory';
import { loadActor } from '../permissions/actor';
import { isCodedError } from '@/lib/errors';

let viewer: string;
let same: string;
let foreign: string;
let suspended: string;
let deleted: string;
let unverified: string;
beforeAll(async () => {
  const a = await createInstitution(db);
  const b = await createInstitution(db);
  viewer = await createUser(db);
  same = await createUser(db);
  foreign = await createUser(db);
  suspended = await createUser(db, { banned: true });
  deleted = await createUser(db, { deletedAt: new Date() });
  unverified = await createUser(db);
  for (const [userId, departmentId, status] of [
    [viewer, a.deptA1, 'VERIFIED'],
    [same, a.deptA2, 'VERIFIED'],
    [foreign, b.deptA1, 'VERIFIED'],
    [suspended, a.deptA1, 'VERIFIED'],
    [deleted, a.deptA1, 'VERIFIED'],
    [unverified, a.deptA1, 'PENDING'],
  ] as const)
    await addMembership(db, { userId, departmentId, role: 'STUDENT', status });
  for (const userId of [foreign, suspended, deleted]) await addMentorProfile(db, userId);
  await grantRequiredConsents(db, viewer);
  session.userId = viewer;
});
afterAll(() => db.$disconnect());

it('profil önizlemesi yalnız aynı üniversitenin etkin doğrulanmış üyesini açar', async () => {
  const visible = await previewContactTarget({ targetUserId: same });
  expect(visible.ok && visible.data.canRequest).toBe(true);
  const missing = await previewContactTarget({ targetUserId: randomUUID() });
  expect(missing).toEqual({
    ok: true,
    data: { canRequest: false, displayName: null, requestableFields: [] },
  });
  for (const targetUserId of [foreign, suspended, deleted, unverified])
    expect(await previewContactTarget({ targetUserId })).toEqual(missing);
});

it('profil talebi kapsamında olmayan hedeflerde yok ile aynı yanıt ve sıfır yazım', async () => {
  const missing = await sendContactRequest({ targetUserId: randomUUID(), fields: ['EMAIL'] });
  expect(missing).toMatchObject({ ok: false, errorCode: 'RESOURCE_NOT_FOUND' });
  for (const targetUserId of [foreign, suspended, deleted, unverified])
    expect(await sendContactRequest({ targetUserId, fields: ['EMAIL'] })).toEqual(missing);
  expect(await db.contactRequest.count({ where: { requesterId: viewer } })).toBe(0);
  const sent = await sendContactRequest({ targetUserId: same, fields: ['EMAIL'] });
  expect(sent).toMatchObject({ ok: true, data: { status: 'PENDING' } });
  expect(await db.contactRequest.count({ where: { requesterId: viewer } })).toBe(1);
});

it('diğer profil, mentor, CV ve randevu kapılarında yabancı/askı/silinen hedef yok ile aynı', async () => {
  const targets = [randomUUID(), foreign, suspended, deleted];
  const actor = (await loadActor(db, viewer, new Date()))!;
  const notifier = createRecordingNotifier();
  const errors = async (f: () => Promise<unknown>) => {
    const error = await f().then(
      () => null,
      (e: unknown) => e,
    );
    return isCodedError(error) ? error.code : 'UNEXPECTED';
  };
  const result = [];
  for (const userId of targets) {
    result.push({
      profile: await errors(() => getProfile({ db }, viewer, userId)),
      slots: await errors(() =>
        listSlots({ db, notifier, calendar: null }, viewer, { mentorId: userId }),
      ),
      appointment: await errors(() =>
        requestAppointment({ db, notifier, calendar: null }, viewer, {
          mentorId: userId,
          startsAt: new Date(Date.now() + 5 * 86_400_000),
          mode: 'ONLINE',
        }),
      ),
      cv: await getAvailability({ db, storage: {} as never }, viewer, userId),
      cvRequest: await errors(() =>
        createCvReview({ db, storage: {} as never }, viewer, {
          mentorId: userId,
          note: 'Görüş isteği',
        }),
      ),
      entry: await getMentorEntryPoints({ db }, actor, { userId }),
    });
  }
  for (const row of result) expect(row).toEqual(result[0]);
  expect(result[0]!.profile).toBe('RESOURCE_NOT_FOUND');
  expect(result[0]!.slots).toBe('RESOURCE_NOT_FOUND');
  expect(result[0]!.appointment).toBe('RESOURCE_NOT_FOUND');
  expect(result[0]!.cvRequest).toBe('CV_REVIEW_UNAVAILABLE');
  expect(result[0]!.cv).toEqual({ available: false, reason: 'NOT_MENTOR' });
});

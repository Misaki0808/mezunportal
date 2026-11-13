import { randomUUID } from 'node:crypto';
import { buildAppointmentEmail } from './appointment-notifier';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  decideNotification,
  getNotificationPreferences,
  maySendNotification,
  setNotificationPreferences,
} from './notification-preferences';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
describe('bildirim tercihi', () => {
  it('varsayılan açık; kapalı tür gönderilmez, zorunlu hesap bildirimi kapatılamaz', async () => {
    const user = await db.user.create({
      data: { name: 'Sahte Üye', email: `${randomUUID()}@example.invalid` },
    });
    const msg = {
      to: user.email,
      subject: 'Örnek',
      text: 'Örnek',
      template: 'contact.requested',
      idempotencyKey: randomUUID(),
      recipientUserId: user.id,
    };
    expect(
      (await getNotificationPreferences(db, user.id)).items.every((item) => item.enabled),
    ).toBe(true);
    expect(await maySendNotification(db, msg)).toBe(true);
    await setNotificationPreferences(db, user.id, {
      items: [{ type: 'CONTACT_REQUEST', enabled: false }],
    });
    expect(await maySendNotification(db, msg)).toBe(false);
    expect(await decideNotification(db, msg)).toEqual({
      send: false,
      errorCode: 'EMAIL_PREFERENCE_DISABLED',
    });
    expect(await maySendNotification(db, { ...msg, template: 'auth.sign-in-link' })).toBe(true);
    await expect(
      setNotificationPreferences(db, user.id, {
        items: [{ type: 'ACCOUNT_SECURITY', enabled: false }],
      }),
    ).rejects.toThrow();
    await expect(maySendNotification(db, { ...msg, template: 'bilinmeyen' })).rejects.toThrow(
      'NOTIFICATION_TEMPLATE_UNKNOWN',
    );
    expect(await maySendNotification(db, { ...msg, to: 'eski@example.invalid' })).toBe(false);
    // Adres değişti: kullanıcı bildirimi KAPATMADI, alıcı artık o adreste değil (sebep kodu tercih değil).
    expect(await decideNotification(db, { ...msg, to: 'eski@example.invalid' })).toEqual({
      send: false,
      errorCode: 'EMAIL_RECIPIENT_INELIGIBLE',
    });
  });
  it('bütün randevu olayları aynı tercih kapısından geçer ve tekrar anahtarı değişmez', async () => {
    const user = await db.user.create({
      data: { name: 'Deneme', email: `${randomUUID()}@example.invalid` },
    });
    const common = {
      appointmentId: randomUUID(),
      recipient: { userId: user.id, email: user.email },
      counterpartName: 'Örnek',
      startsAt: new Date('2030-01-01'),
      mode: 'ONLINE' as const,
    };
    const events = [
      'requested',
      'confirmed',
      'declined',
      'cancelled',
      'expired',
      'reminder',
      'linkNeeded',
      'linkAdded',
    ] as const;
    for (const event of events) {
      const email = buildAppointmentEmail({ ...common, event });
      expect(buildAppointmentEmail({ ...common, event }).idempotencyKey).toBe(email.idempotencyKey);
      expect(
        await maySendNotification(db, { ...email, to: user.email, recipientUserId: user.id }),
      ).toBe(true);
    }
    await setNotificationPreferences(db, user.id, {
      items: [{ type: 'APPOINTMENT', enabled: false }],
    });
    for (const event of events) {
      const email = buildAppointmentEmail({ ...common, event });
      expect(
        await maySendNotification(db, { ...email, to: user.email, recipientUserId: user.id }),
      ).toBe(false);
    }
  });
  it('CV inceleme ve deneyim daveti tercihleri birbirinden bağımsızdır', async () => {
    const user = await db.user.create({
      data: { name: 'Test', email: `${randomUUID()}@example.invalid` },
    });
    const msg = {
      to: user.email,
      subject: 'Örnek',
      text: 'Örnek',
      template: 'cv.review.requested',
      idempotencyKey: randomUUID(),
      recipientUserId: user.id,
    };
    await setNotificationPreferences(db, user.id, {
      items: [{ type: 'CV_REVIEW', enabled: false }],
    });
    expect(await maySendNotification(db, msg)).toBe(false);
    expect(await maySendNotification(db, { ...msg, template: 'cv.invitation' })).toBe(true);
    await setNotificationPreferences(db, user.id, {
      items: [
        { type: 'CV_REVIEW', enabled: true },
        { type: 'CV_INVITATION', enabled: false },
      ],
    });
    expect(await maySendNotification(db, msg)).toBe(true);
    expect(await maySendNotification(db, { ...msg, template: 'cv.invitation' })).toBe(false);
  });
});

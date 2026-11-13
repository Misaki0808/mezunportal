import { describe, expect, it } from 'vitest';

import {
  createAuthEmailPort,
  idempotencyKeyFor,
  notConfiguredEnqueue,
  type EnqueueEmail,
} from './email-port';

function setup() {
  const calls: Parameters<EnqueueEmail>[0][] = [];
  const port = createAuthEmailPort(async (input) => {
    calls.push(input);
    return { emailLogId: 'log-1' };
  });
  return { calls, port };
}

describe('kimlik doğrulama e-postaları (R2 kuyruk imzasına göre)', () => {
  it('giriş bağlantısı: konu + düz metin (bağlantı ve süre), şablon adı, jetonu açığa çıkarmayan anahtar', async () => {
    const { calls, port } = setup();
    await port.sendSignInLink({
      to: 'ayse@example.test',
      url: 'http://localhost:3162/api/auth/magic-link/verify?token=GIZLI',
      token: 'GIZLI',
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toMatchObject({
      to: 'ayse@example.test',
      template: 'auth.sign-in-link',
      subject: 'MezunPortal giriş bağlantın',
    });
    expect(call?.text).toContain('http://localhost:3162/api/auth/magic-link/verify?token=GIZLI');
    expect(call?.text).toContain('10 dakika');
    expect(call?.recipientUserId).toBeUndefined();
    expect(call?.idempotencyKey).toMatch(/^auth\.sign-in-link:[0-9a-f]{40}$/);
    expect(call?.idempotencyKey).not.toContain('GIZLI');
  });

  it('aynı iş anahtarı aynı idempotans anahtarını verir (çift gönderim yok); farklı jeton farklı anahtar', async () => {
    const { calls, port } = setup();
    await port.sendSignInLink({ to: 'a@b.co', url: 'u1', token: 'jeton-1' });
    await port.sendSignInLink({ to: 'a@b.co', url: 'u1-tekrar', token: 'jeton-1' });
    await port.sendSignInLink({ to: 'a@b.co', url: 'u2', token: 'jeton-2' });
    expect(calls[0]?.idempotencyKey).toBe(calls[1]?.idempotencyKey);
    expect(calls[0]?.idempotencyKey).not.toBe(calls[2]?.idempotencyKey);
  });

  it('e-posta değiştirme: eski adrese onay (yeni adres metinde), yeni adrese doğrulama; alıcı kimliği iletilir', async () => {
    const { calls, port } = setup();
    await port.sendChangeEmailConfirmation({
      to: 'eski@b.co',
      newEmail: 'yeni@b.co',
      url: 'http://x/onay',
      token: 't1',
      userId: 'u1',
    });
    await port.sendChangeEmailVerification({
      to: 'yeni@b.co',
      url: 'http://x/dogrula',
      token: 't2',
      userId: 'u1',
    });

    expect(calls[0]).toMatchObject({
      to: 'eski@b.co',
      template: 'auth.change-email-confirmation',
      recipientUserId: 'u1',
    });
    expect(calls[0]?.text).toContain('yeni@b.co');
    expect(calls[0]?.text).toContain('http://x/onay');
    expect(calls[1]).toMatchObject({
      to: 'yeni@b.co',
      template: 'auth.change-email-verification',
      recipientUserId: 'u1',
    });
    expect(calls[1]?.text).toContain('http://x/dogrula');
    expect(calls[0]?.idempotencyKey).not.toBe(calls[1]?.idempotencyKey);
  });

  it('belge kararı: onay metni, ret metni gerekçeyle; idempotans anahtarı belge kimliğinden; dosyanın silindiği söylenir', async () => {
    const { calls, port } = setup();
    await port.sendGraduationDocumentDecision({
      to: 'a@b.co',
      userId: 'u1',
      documentId: 'doc-1',
      decision: 'APPROVED',
    });
    await port.sendGraduationDocumentDecision({
      to: 'a@b.co',
      userId: 'u1',
      documentId: 'doc-1',
      decision: 'APPROVED',
    });
    await port.sendGraduationDocumentDecision({
      to: 'a@b.co',
      userId: 'u1',
      documentId: 'doc-2',
      decision: 'REJECTED',
      reason: 'Barkod doğrulanamadı.',
    });

    expect(calls[0]).toMatchObject({
      template: 'graduation-document.approved',
      subject: 'Mezun belgen incelendi',
      recipientUserId: 'u1',
    });
    expect(calls[0]?.text).toContain('silindi');
    expect(calls[0]?.idempotencyKey).toBe(calls[1]?.idempotencyKey);
    expect(calls[2]).toMatchObject({
      template: 'graduation-document.rejected',
      subject: 'Mezun belgen incelendi',
    });
    expect(calls[2]?.text).toContain('Gerekçe: Barkod doğrulanamadı.');
    expect(calls[2]?.idempotencyKey).not.toBe(calls[0]?.idempotencyKey);
  });

  it('idempotencyKeyFor: tür ayrımı yapar, özet sabit uzunluktadır', () => {
    expect(idempotencyKeyFor('a', 'x')).not.toBe(idempotencyKeyFor('b', 'x'));
    expect(idempotencyKeyFor('a', 'x')).toBe(idempotencyKeyFor('a', 'x'));
    expect(idempotencyKeyFor('a', 'x'.repeat(1000))).toMatch(/^a:[0-9a-f]{40}$/);
  });

  it('kuyruk bağlanmadan önceki varsayılan: gönderim hata verir (sessizce yutmaz)', async () => {
    const port = createAuthEmailPort(notConfiguredEnqueue);
    await expect(port.sendSignInLink({ to: 'a@b.co', url: 'u', token: 't' })).rejects.toThrow(
      'kuyruğu henüz bağlanmadı',
    );
  });
});

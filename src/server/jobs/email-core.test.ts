import { describe, expect, it, vi } from 'vitest';
import { FakeEmailTransport } from '../external/email/fake';
import { EmailTransportError } from '../external/email/types';
import {
  createEmailService,
  type EmailOutbox,
  type EmailRecord,
  type EmailUnitOfWork,
} from './email-core';
import { logEmailEvent } from './email-log';

const message = {
  to: 'recipient@example.invalid',
  subject: 'Sahte konu',
  text: 'Sahte içerik; gizli bağlantı',
  template: 'auth.magicLink',
  idempotencyKey: 'unique-test-key',
};
function fixture(outcomes: ('ok' | 'temporary' | 'permanent')[] = []) {
  const rows = new Map<string, EmailRecord>();
  const published: (typeof message)[] = [];
  const work: EmailUnitOfWork = {
    async find(key) {
      return rows.get(key) ?? null;
    },
    async create(input) {
      const row: EmailRecord = { id: 'log-id', status: 'QUEUED', attempts: 0 };
      rows.set(input.idempotencyKey, row);
      return row;
    },
    async publish(_id, input) {
      published.push(input);
    },
    async mark(_id, state) {
      const row = rows.get(message.idempotencyKey);
      if (row) Object.assign(row, state);
    },
  };
  const outbox: EmailOutbox = { withKey: async (_key, run) => run(work) };
  const transport = new FakeEmailTransport(outcomes);
  const logger = vi.fn();
  return {
    service: createEmailService(outbox, transport, logger),
    transport,
    rows,
    published,
    logger,
    work,
    outbox,
  };
}

describe('e-posta giden kutusu', () => {
  it('istekte göndermez; aynı anahtarı bir kez kuyruğa yazar, teslim tekrarında çift göndermez', async () => {
    const { service, transport, published, rows } = fixture();
    const first = await service.enqueueEmail(message);
    expect(await service.enqueueEmail(message)).toEqual(first);
    expect(published).toHaveLength(1);
    expect(transport.sent).toHaveLength(0);
    await service.deliver(message, 0, 2);
    await service.deliver(message, 1, 2);
    expect(transport.sent).toHaveLength(1);
    expect(rows.get(message.idempotencyKey)).toMatchObject({ status: 'SENT', attempts: 1 });
    expect(transport.sent[0]?.messageId).not.toContain(message.idempotencyKey);
  });
  it('kapatılan bildirim kuyruğa girmez; beklerken kapatılan da teslim edilmez', async () => {
    const { outbox, transport, logger, rows, published } = fixture();
    let allowed = false;
    const service = createEmailService(outbox, transport, logger, async () => allowed);
    expect(await service.enqueueEmail(message)).toEqual({ emailLogId: null });
    expect(published).toHaveLength(0);
    allowed = true;
    await service.enqueueEmail(message);
    allowed = false;
    await service.deliver(message, 0, 2);
    expect(transport.sent).toHaveLength(0);
    expect(rows.get(message.idempotencyKey)).toMatchObject({
      status: 'FAILED',
      errorCode: 'EMAIL_PREFERENCE_DISABLED',
    });
  });
  it('karar sebebiyle döner: bayat içerik DIGEST_STALE yazar ve `stale` günlüğü atar; tercih kodu yazılmaz', async () => {
    const { outbox, transport, logger, rows, published } = fixture();
    let decision: Awaited<ReturnType<NonNullable<Parameters<typeof createEmailService>[3]>>> = true;
    const service = createEmailService(outbox, transport, logger, async () => decision);
    await service.enqueueEmail(message);
    decision = { send: false, errorCode: 'DIGEST_STALE' };
    await service.deliver(message, 0, 2);
    expect(transport.sent).toHaveLength(0);
    expect(rows.get(message.idempotencyKey)).toMatchObject({
      status: 'FAILED',
      errorCode: 'DIGEST_STALE',
    });
    expect(logger.mock.calls.map(([event]) => event)).toEqual(['queued', 'stale']);
    for (const [, recipient] of logger.mock.calls) expect(recipient).toBe('***@***');
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain(message.to);
    expect(logged).not.toContain(message.text);
    expect(published).toHaveLength(1);
  });

  it('kuyruğa alırken bayat çıkan içerik de `stale` günlüğü atar; alıcı uygun değilse atmaz', async () => {
    const { outbox, transport, logger, published } = fixture();
    const decisions = [
      { send: false, errorCode: 'JOB_MATCH_STALE' },
      { send: false, errorCode: 'EMAIL_RECIPIENT_INELIGIBLE' },
    ] as const;
    let index = 0;
    const service = createEmailService(outbox, transport, logger, async () => decisions[index++]!);
    expect(await service.enqueueEmail(message)).toEqual({ emailLogId: null });
    expect(await service.enqueueEmail(message)).toEqual({ emailLogId: null });
    expect(published).toHaveLength(0);
    expect(logger.mock.calls.map(([event]) => event)).toEqual(['stale']);
  });

  it('kuyruk şeması aylık özet parmak izini korur: şemadan düşerse denetim sessizce eski metne dönerdi', async () => {
    const { outbox, transport, logger } = fixture();
    const seen: Array<string | undefined> = [];
    const service = createEmailService(outbox, transport, logger, async (queued) => {
      seen.push(queued.digestFingerprint);
      return true;
    });
    await service.enqueueEmail({ ...message, digestFingerprint: 'parmak-izi_ABC-123' });
    await service.deliver({ ...message, digestFingerprint: 'parmak-izi_ABC-123' }, 0, 2);
    // Hem kuyruğa alırken hem teslimde `safeParse` sonrası değer gelir (şemada olmasaydı `undefined` olurdu).
    expect(seen).toEqual(['parmak-izi_ABC-123', 'parmak-izi_ABC-123']);
    await expect(
      service.enqueueEmail({
        ...message,
        idempotencyKey: 'k2',
        digestFingerprint: 'geçersiz karakter!',
      }),
    ).rejects.toThrow('EMAIL_INPUT_INVALID');
  });

  it('başarı yolunda da (kuyruğa yazma, gönderim) günlüğe yalnız maskeli alıcı gider', async () => {
    const { service, logger } = fixture();
    await service.enqueueEmail(message);
    await service.deliver(message, 0, 2);
    expect(logger.mock.calls.map(([event]) => event)).toEqual(['queued', 'sent']);
    for (const [, recipient] of logger.mock.calls) expect(recipient).toBe('***@***');
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain(message.to);
    expect(logged).not.toContain(message.text);
    expect(logged).not.toContain(message.idempotencyKey);
  });
  it('geçici hatayı yeniden dener; son denemede kalıcı başarısızlık kaydı yazar', async () => {
    const { service, rows, transport } = fixture(['temporary', 'temporary', 'temporary']);
    await service.enqueueEmail(message);
    for (let attempt = 0; attempt < 3; attempt++)
      await expect(service.deliver(message, attempt, 2)).rejects.toBeInstanceOf(
        EmailTransportError,
      );
    expect(rows.get(message.idempotencyKey)).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      errorCode: 'EMAIL_TRANSPORT_UNAVAILABLE',
    });
    await service.deliver(message, 3, 2);
    expect(transport.sent).toHaveLength(0);
  });
  it('geçici hatadan sonra başarıda hata kodunu temizler', async () => {
    const { service, rows, transport } = fixture(['temporary', 'ok']);
    await service.enqueueEmail(message);
    await expect(service.deliver(message, 0, 2)).rejects.toThrow();
    await service.deliver(message, 1, 2);
    expect(rows.get(message.idempotencyKey)).toMatchObject({
      status: 'SENT',
      attempts: 2,
      errorCode: null,
    });
    expect(transport.sent).toHaveLength(1);
  });
  it('kalıcı SMTP reddi yeniden gönderilmez', async () => {
    const { service, rows, transport } = fixture(['permanent']);
    await service.enqueueEmail(message);
    await expect(service.deliver(message, 0, 2)).rejects.toThrow('EMAIL_DELIVERY_REJECTED');
    await service.deliver(message, 1, 2);
    expect(rows.get(message.idempotencyKey)?.status).toBe('FAILED');
    expect(transport.sent).toHaveLength(0);
  });
  it('hata ve günlük sağlayıcı yanıtını/adresi/içeriği taşımaz', async () => {
    const { outbox, rows, logger } = fixture();
    const secret = 'SMTP parola ve alıcı recipient@example.invalid';
    const service = createEmailService(
      outbox,
      {
        async send() {
          throw new Error(secret);
        },
        close() {},
      },
      logger,
    );
    await service.enqueueEmail(message);
    await expect(service.deliver(message, 2, 2)).rejects.not.toThrow(secret);
    expect(JSON.stringify(logger.mock.calls)).not.toContain(message.to);
    expect(JSON.stringify(logger.mock.calls)).not.toContain(message.text);
    expect(JSON.stringify([...rows.values()])).not.toContain(secret);
  });
  it('gerçek günlük fonksiyonu alıcı adresi yazmaz', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      logEmailEvent('failed', message.to);
      const output = String(write.mock.calls[0]?.[0]);
      expect(output).not.toContain('@');
      expect(output).not.toContain(message.to);
    } finally {
      write.mockRestore();
    }
  });
  it('geçersiz adres/başlıkta kayıt ve gönderim yoktur', async () => {
    const { service, published } = fixture();
    await expect(service.enqueueEmail({ ...message, to: 'not-an-email' })).rejects.toThrow(
      'EMAIL_INPUT_INVALID',
    );
    await expect(
      service.enqueueEmail({ ...message, subject: 'Başlık\r\nBcc: evil' }),
    ).rejects.toThrow('EMAIL_INPUT_INVALID');
    expect(published).toHaveLength(0);
  });

  it('kuyruğa alma kararı işlem AÇILMADAN verilir: işlem içinde ikinci havuz bağlantısı tutulmaz (kart 377)', async () => {
    const { work, transport, logger } = fixture();
    let inTransaction = false;
    const seen: boolean[] = [];
    const outbox: EmailOutbox = {
      withKey: async (_key, run) => {
        inTransaction = true;
        try {
          return await run(work);
        } finally {
          inTransaction = false;
        }
      },
    };
    const service = createEmailService(outbox, transport, logger, async () => {
      seen.push(inTransaction);
      return true;
    });
    await service.enqueueEmail(message);
    expect(seen).toEqual([false]);
  });
  it('alıcı kilit sonrası silinmiş görünürse iş açılmaz ve satır yazılmaz (silme yarışı)', async () => {
    const { work, transport, logger, rows, published } = fixture();
    const outbox: EmailOutbox = {
      withKey: async (_key, run) => run({ ...work, recipientUserId: 'u1', recipientDeleted: true }),
    };
    const decide = vi.fn(async () => true);
    const service = createEmailService(outbox, transport, logger, decide);
    expect(await service.enqueueEmail(message)).toEqual({ emailLogId: null });
    expect(published).toHaveLength(0);
    expect(rows.size).toBe(0);
    expect(decide).toHaveBeenCalledTimes(1);
  });
  it('karar reddederse işlem hiç açılmaz', async () => {
    const { transport, logger } = fixture();
    const withKey = vi.fn();
    const service = createEmailService({ withKey }, transport, logger, async () => false);
    expect(await service.enqueueEmail(message)).toEqual({ emailLogId: null });
    expect(withKey).not.toHaveBeenCalled();
  });
});

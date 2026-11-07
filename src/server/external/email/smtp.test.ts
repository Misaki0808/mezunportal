import { describe, expect, it, vi } from 'vitest';
import { parseEnv, EnvValidationError } from '@/lib/env';
import { createSmtpTransport, smtpSettings } from './smtp';
const sendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail, close: vi.fn() }) },
}));
const base = {
  APP_ENV: 'local',
  APP_URL: 'http://localhost:3441',
  DATABASE_URL: 'postgresql://local/db',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  EMAIL_FROM: 'no-reply@example.invalid',
};
describe('SMTP adaptörü', () => {
  it('yalnız Mailpit yerel, zaman aşımı ve dosya/URL erişim engeli açık', () => {
    const options = smtpSettings(parseEnv(base));
    expect(options.socketTimeout).toBe(10000);
    expect(options.logger).toBe(false);
    expect(options.disableFileAccess).toBe(true);
    expect(options.disableUrlAccess).toBe(true);
    expect(() => smtpSettings(parseEnv({ ...base, SMTP_HOST: 'smtp.example.org' }))).toThrow(
      EnvValidationError,
    );
    expect(() => smtpSettings(parseEnv({ ...base, SMTP_PORT: '25' }))).toThrow(EnvValidationError);
  });
  it('eksik/bozuk ayar yalnız değişken adıyla reddedilir', () => {
    expect(() => smtpSettings(parseEnv({ ...base, SMTP_USER: 'secret-user' }))).toThrow(
      EnvValidationError,
    );
    expect(() => parseEnv({ ...base, SMTP_PORT: 'wrong' })).toThrow(EnvValidationError);
    expect(() => smtpSettings(parseEnv({ ...base, SMTP_HOST: undefined }))).toThrow('SMTP_HOST');
  });
  it('alıcıya ait ham SMTP yanıtını hata mesajına taşımaz', async () => {
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error('recipient@example.invalid secret response'), { responseCode: 550 }),
    );
    const transport = createSmtpTransport(parseEnv(base));
    await expect(
      transport.send({
        to: 'recipient@example.invalid',
        subject: 'Deneme',
        text: 'İçerik',
        messageId: '<test@local>',
      }),
    ).rejects.toMatchObject({ message: 'EMAIL_DELIVERY_REJECTED', retryable: false });
  });
  it('başarı yalnız tek adres zarfı ve verilen Message-ID ile gönderilir', async () => {
    sendMail.mockResolvedValueOnce({ accepted: ['recipient@example.invalid'], rejected: [] });
    await createSmtpTransport(parseEnv(base)).send({
      to: 'recipient@example.invalid',
      subject: 'Deneme',
      text: 'İçerik',
      messageId: '<stable@local>',
    });
    expect(sendMail).toHaveBeenLastCalledWith(
      expect.objectContaining({
        envelope: { from: base.EMAIL_FROM, to: ['recipient@example.invalid'] },
        messageId: '<stable@local>',
      }),
    );
  });
});

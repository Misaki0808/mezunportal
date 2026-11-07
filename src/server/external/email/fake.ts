import { EmailTransportError, type EmailDelivery, type EmailTransport } from './types';

/** Yalnız testlerde, gönderilen sahte içerik bellektedir; loglanmaz. */
export class FakeEmailTransport implements EmailTransport {
  readonly sent: EmailDelivery[] = [];
  constructor(private readonly outcomes: ('ok' | 'temporary' | 'permanent')[] = []) {}
  async send(message: EmailDelivery): Promise<void> {
    const outcome = this.outcomes.shift() ?? 'ok';
    if (outcome !== 'ok') throw new EmailTransportError(outcome === 'temporary');
    this.sent.push(structuredClone(message));
  }
  close(): void {}
}

import { describe, expect, it, vi } from 'vitest';

const { enqueue } = vi.hoisted(() => ({
  enqueue: vi
    .fn<(input: unknown) => Promise<{ emailLogId: string }>>()
    .mockResolvedValue({ emailLogId: 'log' }),
}));
vi.mock('../jobs/email', () => ({ enqueueEmail: enqueue }));

import { getAuthEmailPort } from './index';

describe('gerçek kimlik e-posta bağlantısı', () => {
  it('giriş ve belge kararı aynı kuyruğa iş anahtarıyla bağlanır', async () => {
    const port = getAuthEmailPort();
    expect(getAuthEmailPort()).toBe(port);
    const link = {
      to: 'ornek@example.invalid',
      url: 'http://localhost/link',
      token: 'sahte-token',
    };
    await port.sendSignInLink(link);
    await port.sendSignInLink(link);
    await port.sendGraduationDocumentDecision({
      to: link.to,
      userId: 'u1',
      documentId: 'd1',
      decision: 'APPROVED',
    });
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(enqueue.mock.calls[0]).toEqual(enqueue.mock.calls[1]);
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({ template: 'auth.sign-in-link' });
    expect(enqueue.mock.calls[2]?.[0]).toMatchObject({
      template: 'graduation-document.approved',
      recipientUserId: 'u1',
    });
    expect(enqueue.mock.calls[0]?.[0]).not.toHaveProperty('token');
  });
});

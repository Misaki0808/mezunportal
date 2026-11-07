import { describe, expect, it } from 'vitest';

import { GET as exportData } from '@/app/api/hesabim/veri-dokumu/route';

import {
  listContactRequests,
  respondToContactRequest,
  revokeContactRequest,
  sendContactRequest,
  withdrawContactRequest,
} from './contact-request';
import {
  deleteAccount,
  getConsentState,
  getFieldVisibility,
  recordConsents,
  setFieldVisibility,
} from './privacy';

// Oturum bağlantısı (P1-02 servisi) gelene kadar yetki katmanı KAPALIDIR: her eylem veritabanına dokunmadan
// AUTH_UNAUTHENTICATED döner; veri dökümü rotası 401 verir ve gövdesinde yalnız kod taşır.
describe('KVKK eylemleri oturumsuz kapalıdır', () => {
  it.each([
    ['getConsentState', () => getConsentState()],
    [
      'recordConsents',
      () =>
        recordConsents({
          decisions: [{ documentType: 'TERMS_OF_USE', version: 'taslak-1', granted: true }],
        }),
    ],
    ['getFieldVisibility', () => getFieldVisibility()],
    ['setFieldVisibility', () => setFieldVisibility({ field: 'EMAIL', level: 'PRIVATE' })],
    ['deleteAccount', () => deleteAccount({ confirmEmail: 'a@b.co' })],
    ['sendContactRequest', () => sendContactRequest({ targetUserId: 'u', fields: ['EMAIL'] })],
    [
      'respondToContactRequest',
      () => respondToContactRequest({ requestId: 'r', decision: 'APPROVE' }),
    ],
    ['withdrawContactRequest', () => withdrawContactRequest({ requestId: 'r' })],
    ['revokeContactRequest', () => revokeContactRequest({ requestId: 'r' })],
    ['listContactRequests', () => listContactRequests({ box: 'INCOMING' })],
  ] as const)('%s → AUTH_UNAUTHENTICATED', async (_name, call) => {
    expect(await call()).toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
  });

  it('veri dökümü rotası oturumsuz 401 ve yalnız hata kodu', async () => {
    const response = await exportData();
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ errorCode: 'AUTH_UNAUTHENTICATED' });
  });
});

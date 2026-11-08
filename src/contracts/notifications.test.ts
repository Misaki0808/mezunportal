import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_TYPES,
  setNotificationPreferencesSchema,
} from './notifications';

describe('bildirim tercihleri sözleşmesi', () => {
  it('tüm türler katalogda bulunur ve yalnız güvenlik tercihi zorunludur', () => {
    expect(Object.keys(NOTIFICATION_CATALOG)).toEqual([...NOTIFICATION_TYPES]);
    expect(NOTIFICATION_TYPES.filter((type) => NOTIFICATION_CATALOG[type].mandatory)).toEqual([
      'ACCOUNT_SECURITY',
    ]);
  });
  it('zorunlu türü kapatmayı ve yinelenen türleri reddeder', () => {
    expect(
      setNotificationPreferencesSchema.safeParse({
        items: [{ type: 'ACCOUNT_SECURITY', enabled: false }],
      }).success,
    ).toBe(false);
    expect(
      setNotificationPreferencesSchema.safeParse({
        items: [
          { type: 'CONTACT_REQUEST', enabled: false },
          { type: 'CONTACT_REQUEST', enabled: true },
        ],
      }).success,
    ).toBe(false);
    expect(
      setNotificationPreferencesSchema.safeParse({
        items: [{ type: 'CONTACT_REQUEST', enabled: false }],
      }).success,
    ).toBe(true);
  });
});

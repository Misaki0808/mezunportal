import { describe, expect, it } from 'vitest';
import { digestUnsubscribeSubject, digestUnsubscribeToken } from './digest-unsubscribe';

describe('aylık özetten çıkış imzası', () => {
  it('aynı belirteci güvenle tekrar doğrular ve yalnız imzalanan hesabı döndürür', () => {
    const token = digestUnsubscribeToken('user-a', 'test-secret');
    expect(digestUnsubscribeSubject(token, 'test-secret')).toBe('user-a');
    expect(digestUnsubscribeSubject(token, 'test-secret')).toBe('user-a');
    const [, mac] = token.split('.');
    const other = Buffer.from('user-b').toString('base64url');
    expect(digestUnsubscribeSubject(`${other}.${mac}`, 'test-secret')).toBeNull();
  });

  it('değiştirilmiş, farklı anahtarla imzalanmış ve bozuk verileri reddeder', () => {
    const token = digestUnsubscribeToken('user-a', 'test-secret');
    expect(digestUnsubscribeSubject(token, 'other-secret')).toBeNull();
    expect(digestUnsubscribeSubject(`${token}a`, 'test-secret')).toBeNull();
    expect(digestUnsubscribeSubject('broken', 'test-secret')).toBeNull();
    expect(digestUnsubscribeSubject('a'.repeat(321), 'test-secret')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { parseInvitations } from '@/server/services/invitations';
import { parseInvitationEntries } from './invitation-validation';

const hundred = Array.from({ length: 100 }, (_, index) => `k${index}@example.invalid`);
describe('davet listesi istemci ve sunucu sınırları', () => {
  it.each([
    ['başlık, noktalı virgül ve tekrar', 'email\nA@example.invalid; a@example.invalid'],
    ['100 adres', hundred.join('\n')],
  ])('%s: aynı geçerli sonuç', (_name, value) => {
    expect(parseInvitationEntries(value)).toEqual(parseInvitations(value));
  });
  it.each([
    ['boş', ''],
    ['boşluk', '  \n  '],
    ['101 adres', [...hundred, 'son@example.invalid'].join('\n')],
    ['geçersiz adres', 'ayşe@example.invalid'],
    ['emoji', '😀@example.invalid'],
    ['30001 karakter', 'a'.repeat(30001)],
  ])('%s: iki taraf da reddeder', (_name, value) => {
    expect(parseInvitationEntries(value)).toBeNull();
    expect(() => parseInvitations(value)).toThrow();
  });
});

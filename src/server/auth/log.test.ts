import { expect, it, vi } from 'vitest';
import { logAuthFailure } from './log';
it('kimlik günlüğü kullanıcı kontrollü hata adını yazmaz', () => {
  const error = new Error('sentetik gizli');
  error.name = 'AyseYilmaz';
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    logAuthFailure('getSession', error);
    expect(write).toHaveBeenCalledOnce();
    expect(String(write.mock.calls[0]![0])).toBe('[auth] getSession başarısız: Error\n');
  } finally {
    write.mockRestore();
  }
});

it.each([
  [new TypeError('private'), 'TypeError'],
  [new Error('private'), 'Error'],
  ['private', 'NonError'],
])('bilinen sınıf ya da Error sabiti kullanılır', (error, expected) => {
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    logAuthFailure('signOut', error);
    expect(String(write.mock.calls[0]![0])).toBe(`[auth] signOut başarısız: ${expected}\n`);
    expect(String(write.mock.calls[0]![0])).not.toContain('private');
  } finally {
    write.mockRestore();
  }
});

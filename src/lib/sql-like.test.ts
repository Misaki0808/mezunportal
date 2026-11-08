import { describe, expect, it } from 'vitest';

import { escapeLike } from './sql-like';

describe('escapeLike', () => {
  it('özel karakterleri kaçırır, düz metne dokunmaz', () => {
    expect(escapeLike('%')).toBe('\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('\\')).toBe('\\\\');
    expect(escapeLike('100%_\\x')).toBe('100\\%\\_\\\\x');
    expect(escapeLike('Çağrı Merkezi')).toBe('Çağrı Merkezi');
    expect(escapeLike('')).toBe('');
  });
});

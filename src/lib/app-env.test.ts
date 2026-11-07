import { describe, expect, it } from 'vitest';

import { isDevToolsEnabled } from '@/lib/app-env';

describe('isDevToolsEnabled', () => {
  it.each(['local', 'test'])('%s ortamında açık', (appEnv) => {
    expect(isDevToolsEnabled({ APP_ENV: appEnv })).toBe(true);
  });

  it.each([['prod'], ['staging'], [''], [undefined]])(
    '%s ortamında kapalı (güvenli taraf)',
    (appEnv) => {
      expect(isDevToolsEnabled({ APP_ENV: appEnv })).toBe(false);
    },
  );
});

import { describe, expect, it } from 'vitest';

import { ADMIN_ACTION_ACCESS } from '@/contracts/admin';

import * as adminActions from './admin';
import * as userActions from './admin-users';

const all = { ...adminActions, ...userActions } as unknown as Record<
  string,
  (input?: never) => Promise<unknown>
>;

describe('yönetim paneli eylemleri', () => {
  it('erişim tablosundaki her eylem tam bir kez dışa açılır ve tabloda olmayan eylem yoktur', () => {
    expect(Object.keys(all).sort()).toEqual(Object.keys(ADMIN_ACTION_ACCESS).sort());
    expect(Object.keys(adminActions).filter((name) => name in userActions)).toEqual([]);
  });

  it.each(Object.keys(ADMIN_ACTION_ACCESS))(
    '%s oturumsuz AUTH_UNAUTHENTICATED ile kapalıdır',
    async (name) => {
      await expect(all[name]!({} as never)).resolves.toEqual({
        ok: false,
        errorCode: 'AUTH_UNAUTHENTICATED',
      });
    },
  );
});

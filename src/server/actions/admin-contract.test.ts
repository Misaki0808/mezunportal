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

  // Gövdesi yazılmış eylemler hatayı `ActionResult` olarak döner; sözleşme gövdeleri fırlatır.
  const implemented = new Set([
    'suspendUser',
    'unsuspendUser',
    'correctMembership',
    'grantAdmin',
    'revokeAdmin',
  ]);

  it.each(Object.keys(ADMIN_ACTION_ACCESS))(
    '%s oturumsuz AUTH_UNAUTHENTICATED ile kapalıdır',
    async (name) => {
      const call = all[name]!({} as never);
      if (implemented.has(name)) {
        await expect(call).resolves.toEqual({ ok: false, errorCode: 'AUTH_UNAUTHENTICATED' });
      } else {
        await expect(call).rejects.toMatchObject({ code: 'AUTH_UNAUTHENTICATED' });
      }
    },
  );
});

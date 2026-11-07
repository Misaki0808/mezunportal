import { describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';

import {
  requireAdmin,
  requireMentor,
  requireModerator,
  requireUser,
  requireVerifiedMember,
} from './index';

// P1-02 Better Auth’u bağlayana kadar oturum çözümü KAPALIDIR (fail-closed): hiçbir koruma, veritabanına
// bile gitmeden, oturumsuz kullanıcıyı geçirmez.
describe('varsayılan korumalar (oturum bağlantısı henüz yok)', () => {
  it.each([
    ['requireUser', () => requireUser()],
    ['requireVerifiedMember', () => requireVerifiedMember()],
    ['requireMentor', () => requireMentor()],
    ['requireAdmin(SYSTEM)', () => requireAdmin({ kind: 'SYSTEM' })],
    ['requireModerator', () => requireModerator('herhangi-bir-bolum')],
  ])('%s → AUTH_UNAUTHENTICATED (401)', async (_name, guard) => {
    const error = await guard().then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(isCodedError(error)).toBe(true);
    expect(error).toMatchObject({ code: 'AUTH_UNAUTHENTICATED', status: 401 });
  });
});

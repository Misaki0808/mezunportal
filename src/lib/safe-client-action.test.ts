import { expect, it } from 'vitest';
import { safeClientAction } from './safe-client-action';

it('ağ reddini kararlı hataya çevirir, sunucunun sonucunu korur', async () => {
  expect(
    await safeClientAction(async () => {
      throw new Error('secret transport details');
    }),
  ).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  expect(await safeClientAction(async () => ({ ok: true, data: 7 }))).toEqual({
    ok: true,
    data: 7,
  });
});

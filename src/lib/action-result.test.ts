import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { codedConflict, codedUnauthenticated } from '@/lib/errors';

import { actionFailure, actionOk, failureFromZod, parseInput } from './action-result';

const schema = z.object({
  name: z.string({ error: 'VALIDATION_INVALID' }).min(2, { error: 'DOCUMENT_EMPTY' }),
  other: z.number({ error: 'KAYITSIZ_MESAJ' }),
});

describe('action-result', () => {
  it('actionOk veriyi sarar', () => {
    expect(actionOk({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
  });

  it('Zod hatasını alan → kod haritasına çevirir; kayıtsız mesaj VALIDATION_INVALID olur', () => {
    const parsed = schema.safeParse({ name: 'a', other: 'x' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(failureFromZod(parsed.error)).toEqual({
        ok: false,
        errorCode: 'VALIDATION_INVALID',
        fieldErrors: { name: 'DOCUMENT_EMPTY', other: 'VALIDATION_INVALID' },
      });
    }
  });

  it('kök düzey Zod hatasında alan haritası yoktur', () => {
    const parsed = z.string({ error: 'VALIDATION_INVALID' }).safeParse(1);
    if (!parsed.success) {
      expect(failureFromZod(parsed.error)).toEqual({ ok: false, errorCode: 'VALIDATION_INVALID' });
    }
  });

  it('actionFailure: kodlu hata kodunu ve parametreleri taşır, mesajı taşımaz', () => {
    expect(actionFailure(codedConflict('RESOURCE_CONFLICT', { field: 'email' }))).toEqual({
      ok: false,
      errorCode: 'RESOURCE_CONFLICT',
      params: { field: 'email' },
    });
    expect(actionFailure(codedUnauthenticated('AUTH_UNAUTHENTICATED'))).toEqual({
      ok: false,
      errorCode: 'AUTH_UNAUTHENTICATED',
    });
  });

  it('actionFailure: beklenmeyen hata SERVER_UNEXPECTED olur; ham mesaj ve yığın sızmaz', () => {
    const failure = actionFailure(new Error('bağlantı postgresql://mezun:gizli@127.0.0.1 koptu'));
    expect(failure).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
    expect(JSON.stringify(failure)).not.toContain('gizli');
    expect(actionFailure('metin')).toEqual({ ok: false, errorCode: 'SERVER_UNEXPECTED' });
  });

  it('parseInput başarıda veriyi, başarısızlıkta hazır hata değerini verir', () => {
    expect(parseInput(schema, { name: 'ab', other: 1 })).toEqual({
      ok: true,
      data: { name: 'ab', other: 1 },
    });
    const bad = parseInput(schema, { name: 'ab' });
    expect(bad).toMatchObject({ ok: false, failure: { errorCode: 'VALIDATION_INVALID' } });
  });
});

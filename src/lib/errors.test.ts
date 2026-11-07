import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CodedError,
  ERROR_CODES,
  codedConflict,
  codedForbidden,
  codedNotFound,
  codedRateLimited,
  codedValidation,
  isCodedError,
  isErrorCode,
  type ErrorCode,
} from '@/lib/errors';

// Bekçi testi: kayıt <-> metin eşleşmesi. Kayıtlı ama metni olmayan kod ekranda ham koda düşer;
// metni olup kayıtsız kalan kod ölü metindir.
const messages: { errors: { codes: Record<string, string> } } = JSON.parse(
  readFileSync(new URL('../../messages/tr.json', import.meta.url), 'utf8'),
);

describe('hata kodu kataloğu', () => {
  it('her kayıtlı kodun messages/tr.json errors.codes altında metni vardır', () => {
    const missing = ERROR_CODES.filter((code) => !messages.errors.codes[code]?.trim());
    expect(missing).toEqual([]);
  });

  it('errors.codes altındaki her anahtar kayıtlıdır', () => {
    const unregistered = Object.keys(messages.errors.codes).filter((key) => !isErrorCode(key));
    expect(unregistered).toEqual([]);
  });

  it('kodlar benzersizdir', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

describe('kodlu hata yardımcıları', () => {
  it.each([
    ['validation', codedValidation, 422],
    ['forbidden', codedForbidden, 403],
    ['notFound', codedNotFound, 404],
    ['conflict', codedConflict, 409],
    ['rateLimited', codedRateLimited, 429],
  ] as const)('%s doğru tür ve HTTP durumu taşır', (kind, factory, status) => {
    const error = factory('RESOURCE_CONFLICT', { field: 'email' });
    expect(isCodedError(error)).toBe(true);
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
    expect(error.code).toBe('RESOURCE_CONFLICT');
    expect(error.params).toEqual({ field: 'email' });
  });

  it('message kullanıcı metni değil yalnız kodu taşır', () => {
    expect(codedNotFound('RESOURCE_NOT_FOUND').message).toBe('RESOURCE_NOT_FOUND');
  });

  it('kayıtsız kod çalışma anında reddedilir', () => {
    const unregistered = 'KAYITSIZ_KOD' as ErrorCode;
    expect(() => new CodedError('conflict', unregistered)).toThrow(TypeError);
    expect(() => codedValidation(unregistered)).toThrow(TypeError);
  });

  it('düz Error kodlu hata sayılmaz', () => {
    expect(isCodedError(new Error('x'))).toBe(false);
  });
});

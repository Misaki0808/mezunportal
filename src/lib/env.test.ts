import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv } from '@/lib/env';

const valid = { APP_ENV: 'local', APP_URL: 'http://localhost:3100' } as const;

describe('env doğrulaması', () => {
  it('geçerli ortamı çözer; GIT_SHA isteğe bağlıdır', () => {
    expect(parseEnv(valid)).toEqual({ APP_ENV: 'local', APP_URL: 'http://localhost:3100' });
  });

  it('boş GIT_SHA tanımsız sayılır', () => {
    expect(parseEnv({ ...valid, GIT_SHA: '' }).GIT_SHA).toBeUndefined();
  });

  it('eksik APP_ENV düşer ve değişken adını söyler', () => {
    const error = catchError(() => parseEnv({ APP_URL: valid.APP_URL }));
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).invalidKeys).toEqual(['APP_ENV']);
  });

  it('eksik APP_URL düşer', () => {
    const error = catchError(() => parseEnv({ APP_ENV: 'local' }));
    expect((error as EnvValidationError).invalidKeys).toEqual(['APP_URL']);
  });

  it('bilinmeyen APP_ENV değeri düşer', () => {
    expect(() => parseEnv({ ...valid, APP_ENV: 'staging' })).toThrow(EnvValidationError);
  });

  it('URL olmayan APP_URL düşer', () => {
    expect(() => parseEnv({ ...valid, APP_URL: 'localhost' })).toThrow(EnvValidationError);
  });

  it('hata mesajı değişken değerini sızdırmaz', () => {
    const secretLooking = 'cok-gizli-deger-123';
    const error = catchError(() => parseEnv({ APP_ENV: secretLooking, APP_URL: valid.APP_URL }));
    expect((error as Error).message).not.toContain(secretLooking);
  });
});

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Hata fırlatılması bekleniyordu');
}

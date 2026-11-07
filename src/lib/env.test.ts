import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv } from '@/lib/env';

const valid = {
  APP_ENV: 'local',
  APP_URL: 'http://localhost:3100',
  DATABASE_URL: 'postgresql://mezun:mezun@127.0.0.1:5432/mezun_x',
} as const;

describe('env doğrulaması', () => {
  it('geçerli ortamı çözer; GIT_SHA isteğe bağlıdır', () => {
    expect(parseEnv(valid)).toEqual({ ...valid });
  });

  it('boş GIT_SHA tanımsız sayılır', () => {
    expect(parseEnv({ ...valid, GIT_SHA: '' }).GIT_SHA).toBeUndefined();
  });

  it('eksik APP_ENV düşer ve değişken adını söyler', () => {
    const error = catchError(() => parseEnv({ ...valid, APP_ENV: undefined }));
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).invalidKeys).toEqual(['APP_ENV']);
  });

  it('eksik APP_URL düşer', () => {
    const error = catchError(() => parseEnv({ ...valid, APP_URL: undefined }));
    expect((error as EnvValidationError).invalidKeys).toEqual(['APP_URL']);
  });

  it('eksik DATABASE_URL düşer', () => {
    const error = catchError(() => parseEnv({ ...valid, DATABASE_URL: undefined }));
    expect((error as EnvValidationError).invalidKeys).toEqual(['DATABASE_URL']);
  });

  it('PostgreSQL olmayan DATABASE_URL düşer', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://u:p@h/db' })).toThrow(
      EnvValidationError,
    );
  });

  it('DATABASE_URL_TEST isteğe bağlıdır; verilirse PostgreSQL olmalıdır', () => {
    expect(parseEnv({ ...valid, DATABASE_URL_TEST: '' }).DATABASE_URL_TEST).toBeUndefined();
    expect(() => parseEnv({ ...valid, DATABASE_URL_TEST: 'http://x' })).toThrow(EnvValidationError);
  });

  it('bilinmeyen APP_ENV değeri düşer', () => {
    expect(() => parseEnv({ ...valid, APP_ENV: 'staging' })).toThrow(EnvValidationError);
  });

  it('URL olmayan APP_URL düşer', () => {
    expect(() => parseEnv({ ...valid, APP_URL: 'localhost' })).toThrow(EnvValidationError);
  });

  it('hata mesajı değişken değerini sızdırmaz', () => {
    const secretLooking = 'cok-gizli-deger-123';
    const error = catchError(() =>
      parseEnv({
        ...valid,
        APP_ENV: secretLooking,
        DATABASE_URL: `mysql://u:${secretLooking}@h/db`,
      }),
    );
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

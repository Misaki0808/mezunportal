import { describe, expect, it } from 'vitest';

import {
  EnvValidationError,
  INSECURE_DEV_AUTH_SECRET,
  isLinkedInConfigured,
  parseAuthEnv,
  parseEnv,
  parseLlmEnv,
  parseStorageEnv,
} from '@/lib/env';

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

describe('kimlik doğrulama ortamı (parseAuthEnv)', () => {
  const auth = {
    APP_ENV: 'local',
    APP_URL: 'http://localhost:3100',
    BETTER_AUTH_SECRET: 'dev-only-insecure-secret-for-local-and-test-0000',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1025',
    EMAIL_FROM: 'MezunPortal <no-reply@test.mezunportal.local>',
  } as const;

  it('Mailpit ayarlarını çözer; SMTP_SECURE varsayılan false, LinkedIn kapalı', () => {
    const env = parseAuthEnv(auth);
    expect(env).toMatchObject({ SMTP_PORT: 1025, SMTP_SECURE: false });
    expect(isLinkedInConfigured(env)).toBe(false);
  });

  it('boş SMTP_*, LINKEDIN_* satırları tanımsız sayılır (.env.example boş satırlar)', () => {
    const env = parseAuthEnv({
      ...auth,
      SMTP_SECURE: '',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      LINKEDIN_CLIENT_ID: '',
      LINKEDIN_CLIENT_SECRET: '',
    });
    expect(env.SMTP_USER).toBeUndefined();
    expect(isLinkedInConfigured(env)).toBe(false);
  });

  it.each([
    ['BETTER_AUTH_SECRET', undefined],
    ['BETTER_AUTH_SECRET', 'kisa'],
    ['SMTP_HOST', undefined],
    ['SMTP_PORT', undefined],
    ['SMTP_PORT', '70000'],
    ['SMTP_PORT', 'abc'],
    ['EMAIL_FROM', undefined],
    ['EMAIL_FROM', 'adres-degil'],
    ['EMAIL_FROM', 'Ad <a@b.co>\r\nBcc: x@y.zz'],
  ])('%s = %s düşer ve yalnız değişken adını söyler', (key, value) => {
    const error = catchError(() => parseAuthEnv({ ...auth, [key]: value }));
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).invalidKeys).toEqual([key]);
  });

  it('LinkedIn: yalnız biri verilirse düşer, ikisi birlikte etkinleştirir', () => {
    expect(() => parseAuthEnv({ ...auth, LINKEDIN_CLIENT_ID: 'a' })).toThrow(EnvValidationError);
    expect(() => parseAuthEnv({ ...auth, LINKEDIN_CLIENT_SECRET: 'b' })).toThrow(
      EnvValidationError,
    );
    const env = parseAuthEnv({ ...auth, LINKEDIN_CLIENT_ID: 'a', LINKEDIN_CLIENT_SECRET: 'b' });
    expect(isLinkedInConfigured(env)).toBe(true);
  });

  it('SMTP kullanıcı/parola ikisi birlikte verilmeli', () => {
    expect(() => parseAuthEnv({ ...auth, SMTP_USER: 'u' })).toThrow(EnvValidationError);
    expect(() => parseAuthEnv({ ...auth, SMTP_PASSWORD: 'p' })).toThrow(EnvValidationError);
    expect(parseAuthEnv({ ...auth, SMTP_USER: 'u', SMTP_PASSWORD: 'p' }).SMTP_USER).toBe('u');
  });

  it('canlıda (prod) genel geliştirme sırrı reddedilir; local/test kabul eder', () => {
    expect(() => parseAuthEnv({ ...auth, APP_ENV: 'prod' })).toThrow(EnvValidationError);
    expect(
      parseAuthEnv({ ...auth, APP_ENV: 'prod', BETTER_AUTH_SECRET: 'x'.repeat(40) }).APP_ENV,
    ).toBe('prod');
    expect(parseAuthEnv({ ...auth, APP_ENV: 'test' }).APP_ENV).toBe('test');
    expect(INSECURE_DEV_AUTH_SECRET).toBe(auth.BETTER_AUTH_SECRET);
  });

  it('hata mesajı sırrı sızdırmaz', () => {
    const secret = 'cok-gizli-sir-degeri-cok-gizli-sir-degeri';
    const error = catchError(() =>
      parseAuthEnv({ ...auth, BETTER_AUTH_SECRET: secret, SMTP_PORT: 'x' }),
    );
    expect((error as Error).message).not.toContain(secret);
  });
});

describe('dosya depolama ortamı (parseStorageEnv)', () => {
  it('hiçbir değişken yokken güvenli varsayılanlar (yerel sürücü, .data/files)', () => {
    expect(parseStorageEnv({})).toEqual({
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_PATH: '.data/files',
    });
  });

  it('boş satırlar (.env.example) varsayılana düşer; verilen yol korunur', () => {
    expect(parseStorageEnv({ STORAGE_DRIVER: '', STORAGE_LOCAL_PATH: '' })).toEqual({
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_PATH: '.data/files',
    });
    expect(parseStorageEnv({ STORAGE_LOCAL_PATH: '/var/mezun/dosyalar' }).STORAGE_LOCAL_PATH).toBe(
      '/var/mezun/dosyalar',
    );
  });

  it('bilinmeyen sürücü düşer ve yalnız değişken adını söyler', () => {
    const error = catchError(() => parseStorageEnv({ STORAGE_DRIVER: 's3' }));
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).invalidKeys).toEqual(['STORAGE_DRIVER']);
  });
});

describe('CV ayrıştırma / LLM ortamı (parseLlmEnv)', () => {
  const base = { APP_ENV: 'local' };

  it('sağlayıcı boşsa özellik kapalıdır ve günlük sınır varsayılan 5’tir', () => {
    expect(parseLlmEnv(base).LLM_PROVIDER).toBeUndefined();
    expect(parseLlmEnv(base).CV_PARSE_DAILY_LIMIT).toBe(5);
    const blank = parseLlmEnv({ ...base, LLM_PROVIDER: '', CV_PARSE_DAILY_LIMIT: '' });
    expect(blank.LLM_PROVIDER).toBeUndefined();
    expect(blank.CV_PARSE_DAILY_LIMIT).toBe(5);
  });

  it('fake sağlayıcı local ve test’te kabul edilir', () => {
    expect(parseLlmEnv({ ...base, LLM_PROVIDER: 'fake' }).LLM_PROVIDER).toBe('fake');
    expect(parseLlmEnv({ APP_ENV: 'test', LLM_PROVIDER: 'fake' }).LLM_PROVIDER).toBe('fake');
  });

  it('PROD’DA fake sağlayıcı env doğrulamasını düşürür (sahte CV çıktısı canlıya gitmez)', () => {
    expect(() => parseLlmEnv({ APP_ENV: 'prod', LLM_PROVIDER: 'fake' })).toThrow(
      EnvValidationError,
    );
    try {
      parseLlmEnv({ APP_ENV: 'prod', LLM_PROVIDER: 'fake' });
    } catch (error) {
      expect((error as EnvValidationError).invalidKeys).toEqual(['LLM_PROVIDER']);
    }
    expect(parseLlmEnv({ APP_ENV: 'prod' }).LLM_PROVIDER).toBeUndefined();
  });

  it('bilinmeyen sağlayıcı ve geçersiz günlük sınır reddedilir; hata yalnız değişken adını taşır', () => {
    expect(() => parseLlmEnv({ ...base, LLM_PROVIDER: 'baska' })).toThrow(EnvValidationError);
    for (const bad of ['0', '51', '-1', 'abc', '2.5']) {
      expect(() => parseLlmEnv({ ...base, CV_PARSE_DAILY_LIMIT: bad })).toThrow(EnvValidationError);
    }
    expect(parseLlmEnv({ ...base, CV_PARSE_DAILY_LIMIT: '50' }).CV_PARSE_DAILY_LIMIT).toBe(50);
    try {
      parseLlmEnv({ ...base, LLM_PROVIDER: 'gizli-deger-123' });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain('gizli-deger-123');
    }
  });
});

describe('Takvim ortamı (parseCalendarEnv)', () => {
  const base = { APP_ENV: 'local' };
  it('boşken takvim kapalı (sağlayıcı yok)', async () => {
    const { parseCalendarEnv } = await import('./env');
    expect(parseCalendarEnv(base).CALENDAR_PROVIDER).toBeUndefined();
    expect(parseCalendarEnv({ ...base, CALENDAR_PROVIDER: '' }).CALENDAR_PROVIDER).toBeUndefined();
  });
  it('fake yalnız local/test; prod’da ve bilinmeyen değerde env düşer', async () => {
    const { parseCalendarEnv, EnvValidationError } = await import('./env');
    expect(parseCalendarEnv({ APP_ENV: 'test', CALENDAR_PROVIDER: 'fake' }).CALENDAR_PROVIDER).toBe(
      'fake',
    );
    expect(() => parseCalendarEnv({ APP_ENV: 'prod', CALENDAR_PROVIDER: 'fake' })).toThrow(
      EnvValidationError,
    );
    expect(() => parseCalendarEnv({ APP_ENV: 'local', CALENDAR_PROVIDER: 'bilinmeyen' })).toThrow(
      EnvValidationError,
    );
  });
  it('google: istemci kimliği ve sırrı zorunlu; hangisi eksikse yalnız onun adı raporlanır; prod’da da geçerli', async () => {
    const { parseCalendarEnv, EnvValidationError } = await import('./env');
    const google = { APP_ENV: 'prod', CALENDAR_PROVIDER: 'google' };
    expect(() => parseCalendarEnv(google)).toThrow(EnvValidationError);
    for (const missing of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const) {
      const present = missing === 'GOOGLE_CLIENT_ID' ? 'GOOGLE_CLIENT_SECRET' : 'GOOGLE_CLIENT_ID';
      try {
        parseCalendarEnv({ ...google, [present]: 'deger' });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(EnvValidationError);
        expect(String((error as Error).message)).toContain(missing);
        expect(String((error as Error).message)).not.toContain(present);
      }
    }
    expect(
      parseCalendarEnv({ ...google, GOOGLE_CLIENT_ID: 'kimlik', GOOGLE_CLIENT_SECRET: 'sir' })
        .CALENDAR_PROVIDER,
    ).toBe('google');
    // anahtarlar google dışında zorunlu değildir (sahte/kapalı modda çalışır)
    expect(
      parseCalendarEnv({ APP_ENV: 'local', CALENDAR_PROVIDER: 'fake' }).GOOGLE_CLIENT_ID,
    ).toBeUndefined();
  });
});

describe('Puan ortamı (parsePointsEnv)', () => {
  it('boşken pilot açık (bitiş yok)', async () => {
    const { parsePointsEnv } = await import('./env');
    expect(parsePointsEnv({}).FOUNDING_MEMBER_UNTIL).toBeUndefined();
    expect(parsePointsEnv({ FOUNDING_MEMBER_UNTIL: '' }).FOUNDING_MEMBER_UNTIL).toBeUndefined();
  });
  it('tarih İstanbul gününün sonu olarak okunur', async () => {
    const { parsePointsEnv } = await import('./env');
    expect(parsePointsEnv({ FOUNDING_MEMBER_UNTIL: '2030-12-31' }).FOUNDING_MEMBER_UNTIL).toEqual(
      new Date('2030-12-31T20:59:59.999Z'),
    );
  });
  it('geçersiz biçim ve var olmayan tarih env doğrulamasını düşürür', async () => {
    const { parsePointsEnv, EnvValidationError } = await import('./env');
    for (const bad of ['31.12.2030', '2030-13-01', '2030-02-30', 'yarın'])
      expect(() => parsePointsEnv({ FOUNDING_MEMBER_UNTIL: bad })).toThrow(EnvValidationError);
  });
});

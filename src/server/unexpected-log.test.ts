import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { codedForbidden, codedNotFound } from '@/lib/errors';

import { loggedJob, logUnexpected, unexpectedLogLine } from './unexpected-log';

const SECRET_MESSAGE = 'ayse.yilmaz@ogr.iu.edu.tr token=abc123 postgres://mezun:parola@db/x';

/** İletiyi, yığın izini ve kişisel veriyi taşıyan gerçekçi bir hata. */
function leakyError(name = 'Error', extra: Record<string, unknown> = {}) {
  const error = Object.assign(new Error(SECRET_MESSAGE), extra);
  error.name = name;
  return error;
}

const parse = (line: string | null) => JSON.parse(line ?? 'null') as Record<string, unknown>;

describe('unexpectedLogLine (saf): tek satır, yalnız güvenli alanlar', () => {
  it('beklenmedik hata: olay adı, işlem, hata sınıfı; ileti, yığın izi ve kişisel veri YOK', () => {
    const line = unexpectedLogLine('action', 'saveConsents', leakyError());
    expect(parse(line)).toEqual({
      event: 'action.unexpected',
      source: 'saveConsents',
      errorName: 'Error',
    });
    expect(line).not.toMatch(/ayse|@|token|abc123|postgres|parola/);
    expect(line).not.toContain('\n');
    expect(line).not.toMatch(/\bat \w/); // yığın izi satırı yok
  });

  it('kind olay adının önekidir: action / route / job', () => {
    for (const kind of ['action', 'route', 'job'] as const)
      expect(parse(unexpectedLogLine(kind, 'x', new Error('a')))).toMatchObject({
        event: `${kind}.unexpected`,
      });
  });

  it('Prisma/pg/Node kodu varsa yazılır (kendi alanı ya da bir seviye cause)', () => {
    expect(
      parse(
        unexpectedLogLine(
          'action',
          'x',
          leakyError('PrismaClientKnownRequestError', { code: 'P2034' }),
        ),
      ),
    ).toMatchObject({
      errorName: 'PrismaClientKnownRequestError',
      errorCode: 'P2034',
    });
    expect(
      parse(unexpectedLogLine('job', 'x', leakyError('Error', { cause: { code: '40001' } }))),
    ).toMatchObject({
      errorCode: '40001',
    });
    expect(
      parse(
        unexpectedLogLine('job', 'x', leakyError('Error', { cause: { originalCode: '57014' } })),
      ),
    ).toMatchObject({
      errorCode: '57014',
    });
    expect(
      parse(unexpectedLogLine('route', 'x', leakyError('Error', { code: 'ECONNRESET' }))),
    ).toMatchObject({
      errorCode: 'ECONNRESET',
    });
  });

  it('kod bir cümle/değer taşıyorsa (desene uymuyorsa) yazılmaz', () => {
    const line = unexpectedLogLine(
      'action',
      'x',
      leakyError('Error', { code: 'bağlantı ayse@ogr.iu.edu.tr reddedildi' }),
    );
    expect(parse(line)).not.toHaveProperty('errorCode');
    expect(line).not.toContain('ayse');
  });

  it('hata adı ve işlem adı dar desenden geçer; desene uymayan sabit yer tutucuya düşer', () => {
    expect(
      parse(unexpectedLogLine('action', 'a b@c.d', leakyError('Hata: ayse@x.com'))),
    ).toMatchObject({
      source: 'bilinmeyen',
      errorName: 'Error',
    });
    expect(parse(unexpectedLogLine('action', 'x'.repeat(65), new Error('a')))).toMatchObject({
      source: 'bilinmeyen',
    });
  });

  it('Error olmayan değer fırlatıldıysa içeriği yazılmaz', () => {
    const line = unexpectedLogLine('action', 'x', 'ayse@ogr.iu.edu.tr parolası');
    expect(parse(line)).toEqual({ event: 'action.unexpected', source: 'x', errorName: 'NonError' });
    expect(line).not.toContain('ayse');
  });

  it('kodlu hata, doğrulama hatası ve Next.js akış denetimi günlüğe DÜŞMEZ', () => {
    expect(unexpectedLogLine('action', 'x', codedForbidden('AUTH_FORBIDDEN'))).toBeNull();
    expect(unexpectedLogLine('route', 'x', codedNotFound('RESOURCE_NOT_FOUND'))).toBeNull();
    const zod = z.object({ a: z.string() }).safeParse({}).error!;
    expect(unexpectedLogLine('action', 'x', zod)).toBeNull();
    for (const digest of [
      'NEXT_REDIRECT;replace;/giris;307;',
      'NEXT_HTTP_ERROR_FALLBACK;404',
      'DYNAMIC_SERVER_USAGE',
      'BAILOUT_TO_CLIENT_SIDE_RENDERING',
    ])
      expect(
        unexpectedLogLine('action', 'x', Object.assign(new Error('x'), { digest })),
      ).toBeNull();
  });

  it('digest alanı olan ama Next akış denetimi olmayan hata günlüğe düşer', () => {
    expect(
      unexpectedLogLine('action', 'x', Object.assign(new Error('x'), { digest: '123456789' })),
    ).not.toBeNull();
  });
});

describe('izin listeleri (kart 330): yük altı hata kodları ve uygulamanın kendi sınıfları', () => {
  // Bilerek elle yazılmış: kaynak listeden bir üye silinirse bu test düşer.
  const PRISMA = ['P1001', 'P1002', 'P1008', 'P1017', 'P2010', 'P2024', 'P2028', 'P2037', 'P2039'];
  const PG = ['53300', '55P03', '57P01', '40P01', '57014'];
  const APP_CODES = [
    'TIMEOUT',
    'UNAVAILABLE',
    'REJECTED',
    'CALENDAR_UNAVAILABLE',
    'CALENDAR_TIMEOUT',
    'CALENDAR_REJECTED',
    'CALENDAR_NOT_CONNECTED',
    'GOOGLE_STATE_INVALID',
    'GOOGLE_STATE_EXPIRED',
    'GOOGLE_EXCHANGE_FAILED',
    'GOOGLE_NO_REFRESH_TOKEN',
  ];
  const APP_NAMES = [
    'AuditPolicyError',
    'CalendarError',
    'EmailTransportError',
    'EnvValidationError',
    'GoogleOAuthError',
    'LlmError',
    'NotImplementedError',
    'SecretBoxError',
    'StorageError',
  ];

  it.each([...PRISMA, ...PG, ...APP_CODES])('listedeki kod %s satırda görünür', (code) => {
    const line = unexpectedLogLine('job', 'x', leakyError('Error', { code }));
    expect(parse(line)).toMatchObject({ errorCode: code });
    expect(line).not.toMatch(/ayse|token|postgres/);
  });

  it.each(APP_NAMES)('listedeki sınıf adı %s satırda görünür', (name) => {
    const line = unexpectedLogLine('job', 'x', leakyError(name));
    expect(parse(line)).toMatchObject({ errorName: name });
    expect(line).not.toMatch(/ayse|token|postgres/);
  });

  it('listede olmayan ad ve kod: ad "Error"a düşer, kod yazılmaz', () => {
    for (const code of ['P9999', '99999', 'KULLANICI_ADI', 'ayse@ogr.iu.edu.tr', '12345678901']) {
      const line = unexpectedLogLine('job', 'x', leakyError('Error', { code }));
      expect(parse(line)).not.toHaveProperty('errorCode');
      expect(line).not.toContain('ayse');
    }
    for (const name of ['AyseYilmaz', 'DriverAdapterError', 'lisanslıHata'])
      expect(parse(unexpectedLogLine('job', 'x', leakyError(name)))).toMatchObject({
        errorName: 'Error',
      });
  });

  it('bekçi: kaynaktaki her uygulama hata sınıfı adıyla listede (yeni sınıf listeye eklenmeden geçemez)', () => {
    const names = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== 'generated' && entry !== 'node_modules') walk(path);
        } else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) {
          for (const match of readFileSync(path, 'utf8').matchAll(
            /class\s+(\w+)\s+extends\s+(?:Error|\w*Error)\b/g,
          ))
            names.add(match[1]!);
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    names.delete('CodedError'); // kodlu hata günlüğe hiç düşmez (isCodedError)
    expect(names.size).toBeGreaterThanOrEqual(APP_NAMES.length);
    for (const name of names)
      expect(
        parse(unexpectedLogLine('job', 'x', leakyError(name))),
        `${name}: hata sınıfı adı NAMES listesine eklenmeli (src/server/unexpected-log.ts)`,
      ).toMatchObject({ errorName: name });
  });
});

describe('driverCode (kart 330 b): Prisma sürücü hatasındaki pg kodu', () => {
  /** Kendi sürücümde ölçülen şekil: üst kod genel, pg kodu `meta.driverAdapterError.cause`'ta. */
  const prismaDriverError = (code: string, cause: Record<string, unknown>) =>
    leakyError('PrismaClientKnownRequestError', {
      code,
      meta: { driverAdapterError: { name: 'DriverAdapterError', cause } },
    });

  it('statement_timeout: errorCode genel P2010, driverCode asıl pg kodu; ileti, ana makine ve ayrıntı yazılmaz', () => {
    const line = unexpectedLogLine(
      'action',
      'x',
      prismaDriverError('P2010', {
        originalCode: '57014',
        originalMessage: 'canceling statement ayse@ogr.iu.edu.tr',
        kind: 'postgres',
        code: '57014',
        message: 'canceling statement ayse@ogr.iu.edu.tr',
        detail: 'postgres://mezun:parola@db/x',
      }),
    );
    expect(parse(line)).toEqual({
      event: 'action.unexpected',
      source: 'x',
      errorName: 'PrismaClientKnownRequestError',
      errorCode: 'P2010',
      driverCode: '57014',
    });
    expect(line).not.toMatch(/ayse|postgres|parola|canceling/);
  });

  it('yalnız originalCode taşıyan (kilitlenme) ve bağlantı sonlandırma şekilleri', () => {
    expect(
      parse(
        unexpectedLogLine(
          'job',
          'x',
          prismaDriverError('P2010', { originalCode: '40P01', kind: 'TransactionWriteConflict' }),
        ),
      ),
    ).toMatchObject({ errorCode: 'P2010', driverCode: '40P01' });
    expect(
      parse(
        unexpectedLogLine(
          'job',
          'x',
          prismaDriverError('P2039', { originalCode: '55P03', code: '55P03' }),
        ),
      ),
    ).toMatchObject({ errorCode: 'P2039', driverCode: '55P03' });
  });

  it('originalCode önce, code sonra aranır', () => {
    const line = unexpectedLogLine(
      'job',
      'x',
      prismaDriverError('P2010', { originalCode: '57P01', code: '57014' }),
    );
    expect(parse(line)).toMatchObject({ driverCode: '57P01' });
  });

  it('kodsuz sürücü hatası (bağlantı reddi) ve listede olmayan sürücü kodu: driverCode yok, ana makine/kapı yazılmaz', () => {
    for (const cause of [
      { kind: 'DatabaseNotReachable', host: '10.1.2.3', port: 5432 },
      { originalCode: '12345678901', code: 'ayse@ogr.iu.edu.tr' },
      { originalCode: 'P9999' },
    ]) {
      const line = unexpectedLogLine('job', 'x', prismaDriverError('P1001', cause));
      expect(parse(line)).not.toHaveProperty('driverCode');
      expect(parse(line)).toMatchObject({ errorCode: 'P1001' });
      expect(line).not.toMatch(/ayse|10\.1\.2\.3|5432|12345678901/);
    }
  });

  it('beklenmeyen yapı (meta ya da iç alanlar nesne değil) hata fırlatmaz, driverCode yazmaz', () => {
    for (const meta of [
      null,
      'metin',
      42,
      [],
      {},
      { driverAdapterError: 'x' },
      { driverAdapterError: null },
      { driverAdapterError: { cause: 'x' } },
      { driverAdapterError: { cause: null } },
    ]) {
      const line = unexpectedLogLine('job', 'x', leakyError('Error', { meta }));
      expect(parse(line)).not.toHaveProperty('driverCode');
    }
  });

  it('üst kod olmasa da sürücü kodu yazılır; errorCode anlamı değişmez', () => {
    const line = unexpectedLogLine(
      'job',
      'x',
      leakyError('Error', {
        meta: { driverAdapterError: { cause: { originalCode: '53300' } } },
      }),
    );
    const parsed = parse(line);
    expect(parsed).toMatchObject({ driverCode: '53300' });
    expect(parsed).not.toHaveProperty('errorCode');
  });
});

describe('logUnexpected / loggedJob: stderr', () => {
  afterEach(() => vi.restoreAllMocks());
  const stderr = () => vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  it("beklenmedik hata: stderr'e TAM BİR satır", () => {
    const write = stderr();
    logUnexpected('action', 'saveConsents', leakyError('Error', { code: 'P2034' }));
    expect(write).toHaveBeenCalledTimes(1);
    const line = String(write.mock.calls[0]![0]);
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trim().split('\n')).toHaveLength(1);
    expect(parse(line.trim())).toEqual({
      event: 'action.unexpected',
      source: 'saveConsents',
      errorName: 'Error',
      errorCode: 'P2034',
    });
  });

  it('kodlu hata: hiçbir şey yazılmaz (gürültü yok)', () => {
    const write = stderr();
    logUnexpected('action', 'x', codedForbidden('AUTH_FORBIDDEN'));
    expect(write).not.toHaveBeenCalled();
  });

  it('günlük yazımı hata verirse çağıranın akışını bozmaz', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      throw new Error('stderr kapalı');
    });
    expect(() => logUnexpected('action', 'x', new Error('a'))).not.toThrow();
  });

  it('loggedJob: başarıda değeri döner ve yazmaz', async () => {
    const write = stderr();
    await expect(loggedJob('monthly.digest', async () => 42)).resolves.toBe(42);
    expect(write).not.toHaveBeenCalled();
  });

  it('loggedJob: beklenmedik hatada bir satır yazar ve AYNI hatayı yeniden fırlatır (pg-boss yeniden deneme davranışı değişmez)', async () => {
    const write = stderr();
    const error = leakyError();
    await expect(loggedJob('monthly.digest', async () => Promise.reject(error))).rejects.toBe(
      error,
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(parse(String(write.mock.calls[0]![0]).trim())).toEqual({
      event: 'job.unexpected',
      source: 'monthly.digest',
      errorName: 'Error',
    });
  });

  it('loggedJob: kodlu hatayı yazmadan yeniden fırlatır', async () => {
    const write = stderr();
    const error = codedForbidden('AUTH_FORBIDDEN');
    await expect(loggedJob('x', async () => Promise.reject(error))).rejects.toBe(error);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('bekçi: rota işleyicileri beklenmedik hatayı sessizce yutmaz', () => {
  const root = join(__dirname, '..', 'app', 'api');
  const routes = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? routes(path) : name === 'route.ts' ? [path] : [];
    });
  /** Hata yutmayan ya da başka mekanizması olan rotalar (gerekçeleriyle). */
  const SERBEST: Record<string, string> = {
    'auth/[...all]/route.ts':
      'Better Auth işleyicisi; kendi günlüğü `config.ts` içinde, ileti temizlenir',
    'health/route.ts': 'hata yolu yok (sağlık yanıtı)',
    'aylik-ozet/abonelikten-cik/route.ts':
      'yalnız JSON ayrıştırma hatası yutulur (beklenen, girdi biçimi)',
  };

  it('`catch (error)` içeren her rota `logUnexpected` çağırır; parametresiz `catch {` yalnız gerekçeli listede', () => {
    const eksik: string[] = [];
    let incelenen = 0;
    for (const path of routes(root)) {
      const rel = path.slice(root.length + 1);
      const text = readFileSync(path, 'utf8');
      const hasCatch = /\bcatch\b/.test(text);
      if (!hasCatch || rel in SERBEST) continue;
      incelenen++;
      if (/catch \{/.test(text)) eksik.push(`${rel}: parametresiz catch`);
      if (!text.includes('logUnexpected(')) eksik.push(`${rel}: logUnexpected yok`);
    }
    expect(incelenen).toBeGreaterThanOrEqual(9);
    expect(eksik).toEqual([]);
  });

  it('serbest liste bayatlamasın: listedeki her rota gerçekten var', () => {
    const var_ = new Set(routes(root).map((path) => path.slice(root.length + 1)));
    for (const rel of Object.keys(SERBEST)) expect(var_.has(rel), rel).toBe(true);
  });
});

it('güvenli görünümlü kişisel veri hata adı ve hata kodundan sızmaz', () => {
  const e = Object.assign(new Error('gizli'), { code: '12345678901' });
  e.name = 'AyseYilmaz';
  const line = unexpectedLogLine('action', 'saveConsents', e)!;
  expect(line).not.toMatch(/AyseYilmaz|12345678901|ayse\.yilmaz|1234567890123456/);
});

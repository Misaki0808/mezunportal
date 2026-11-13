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

  it('istek ve eylem kimliği yalnız güvenli biçimdeyse yazılır', () => {
    expect(
      parse(
        unexpectedLogLine('action', 'x', new Error('a'), {
          requestId: 'req-1.A_b',
          actionId: '40' + 'ab'.repeat(20),
        }),
      ),
    ).toMatchObject({ requestId: 'req-1.A_b', actionId: '40' + 'ab'.repeat(20) });
    const sahte = parse(
      unexpectedLogLine('action', 'x', new Error('a'), {
        requestId: 'ayse@ogr.iu.edu.tr',
        actionId: 'ZZ gizli',
      }),
    );
    expect(sahte).not.toHaveProperty('requestId');
    expect(sahte).not.toHaveProperty('actionId');
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

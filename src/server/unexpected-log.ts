import 'server-only';

import { z } from 'zod';

import { isCodedError } from '@/lib/errors';

/**
 * Beklenmedik (kodlu olmayan) hatanın TEK satırlık yapılandırılmış günlüğü (docs/security.md "Sır ve loglama").
 * Yazılan alanlar: olay adı, işlem adı (sabit dize), sabit izin listesindeki hata sınıfı ve isteğe bağlı hata kodu.
 * İstemciden gelen kimlik, `message`, yığın izi, girdi, e-posta, kullanıcı kimliği ve değerler ASLA yazılmaz.
 * Kodlu hatalar (kullanıcıya dönen `errorCode`), doğrulama hataları ve Next.js'in akış denetimi hataları (yönlendirme,
 * bulunamadı) günlüğe düşmez: gürültü olmaz, yalnız gerçekten beklenmedik hata görünür.
 */
export type UnexpectedKind = 'action' | 'route' | 'job';

const SOURCE = /^[A-Za-z0-9_.:-]{1,64}$/;
// İletiyle aynı güven sınırında olan `name` ve `code` serbest metin olabilir.
// Desen kontrolü kişisel veriyi elemez; yalnız sabit, bilinen değerleri kabul et.
const NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  'PrismaClientKnownRequestError',
  'PrismaClientUnknownRequestError',
  'PrismaClientInitializationError',
  'PrismaClientRustPanicError',
  'PrismaClientValidationError',
]);
const CODES = new Set([
  'P2002',
  'P2003',
  'P2025',
  'P2034',
  '40001',
  '40P01',
  '57014',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENOSPC',
]);
const CONTROL_FLOW =
  /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING|HTTP_ERROR_FALLBACK)/;

type Loose = { code?: unknown; originalCode?: unknown; cause?: unknown; digest?: unknown };

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && CODES.has(value) ? value : undefined;
}

/** Hata ya da bir seviye `cause` üzerinde güvenli bir kod arar (Prisma sürücü bağdaştırıcısı pg kodunu `cause`'ta taşır). */
function codeOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const loose = error as Loose;
  const own = safeCode(loose.code) ?? safeCode(loose.originalCode);
  if (own) return own;
  const cause = loose.cause;
  if (!cause || typeof cause !== 'object') return undefined;
  return safeCode((cause as Loose).code) ?? safeCode((cause as Loose).originalCode);
}

function nameOf(error: unknown): string {
  const name = error instanceof Error ? error.name : 'NonError';
  return NAMES.has(name) ? name : error instanceof Error ? 'Error' : 'NonError';
}

function isControlFlow(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { digest } = error as Loose;
  return typeof digest === 'string' && CONTROL_FLOW.test(digest);
}

/** Günlük satırı; günlüğe düşmeyecek hatada `null`. Saftır (test edilir). */
export function unexpectedLogLine(
  kind: UnexpectedKind,
  source: string,
  error: unknown,
): string | null {
  if (isCodedError(error) || error instanceof z.ZodError || isControlFlow(error)) return null;
  const code = codeOf(error);
  return JSON.stringify({
    event: `${kind}.unexpected`,
    source: SOURCE.test(source) ? source : 'bilinmeyen',
    errorName: nameOf(error),
    ...(code ? { errorCode: code } : {}),
  });
}

/** Günlüğe yazar; günlük yazımı asla hata fırlatmaz ve çağıranın akışını değiştirmez. */
export function logUnexpected(kind: UnexpectedKind, source: string, error: unknown): void {
  try {
    const line = unexpectedLogLine(kind, source, error);
    if (line) process.stderr.write(`${line}\n`);
  } catch {
    // Günlük kullanılamıyorsa sessiz kal: asıl hata yolu bozulmasın.
  }
}

/** Zamanlanmış/kuyruk işini sarar: beklenmedik hatayı tek satır günlüğe yazar ve AYNEN yeniden fırlatır (pg-boss yeniden deneme davranışı değişmez). */
export async function loggedJob<T>(source: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    logUnexpected('job', source, error);
    throw error;
  }
}

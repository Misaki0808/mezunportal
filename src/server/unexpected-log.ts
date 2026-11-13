import 'server-only';

import { z } from 'zod';

import { isCodedError } from '@/lib/errors';

/**
 * Beklenmedik (kodlu olmayan) hatanın TEK satırlık yapılandırılmış günlüğü (docs/security.md "Sır ve loglama").
 * Yazılan alanlar: olay adı, işlem adı (sabit dize), hata sınıfı adı, varsa güvenli hata kodu (Prisma `P2034`, pg `40001`,
 * Node `ECONNRESET`) ve istek/eylem kimliği. `message`, yığın izi, girdi, e-posta, kullanıcı kimliği ve değerler ASLA yazılmaz:
 * her alan dar bir desenden geçer, desene uymayan değer yazılmaz ya da sabit bir yer tutucuya düşer.
 * Kodlu hatalar (kullanıcıya dönen `errorCode`), doğrulama hataları ve Next.js'in akış denetimi hataları (yönlendirme,
 * bulunamadı) günlüğe düşmez: gürültü olmaz, yalnız gerçekten beklenmedik hata görünür.
 */
export type UnexpectedKind = 'action' | 'route' | 'job';
export type UnexpectedContext = { requestId?: string | null; actionId?: string | null };

const SOURCE = /^[A-Za-z0-9_.:-]{1,64}$/;
const NAME = /^[A-Za-z0-9_$.]{1,64}$/;
const CODE = /^[A-Za-z0-9_]{2,32}$/;
const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
const ACTION_ID = /^[0-9a-f]{16,64}$/;
const CONTROL_FLOW =
  /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING|HTTP_ERROR_FALLBACK)/;

type Loose = { code?: unknown; originalCode?: unknown; cause?: unknown; digest?: unknown };

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && CODE.test(value) ? value : undefined;
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
  return NAME.test(name) ? name : 'Error';
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
  context: UnexpectedContext = {},
): string | null {
  if (isCodedError(error) || error instanceof z.ZodError || isControlFlow(error)) return null;
  const code = codeOf(error);
  const { requestId, actionId } = context;
  return JSON.stringify({
    event: `${kind}.unexpected`,
    source: SOURCE.test(source) ? source : 'bilinmeyen',
    errorName: nameOf(error),
    ...(code ? { errorCode: code } : {}),
    ...(requestId && REQUEST_ID.test(requestId) ? { requestId } : {}),
    ...(actionId && ACTION_ID.test(actionId) ? { actionId } : {}),
  });
}

/** Günlüğe yazar; günlük yazımı asla hata fırlatmaz ve çağıranın akışını değiştirmez. */
export function logUnexpected(
  kind: UnexpectedKind,
  source: string,
  error: unknown,
  context: UnexpectedContext = {},
): void {
  try {
    const line = unexpectedLogLine(kind, source, error, context);
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

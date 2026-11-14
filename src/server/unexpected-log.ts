import 'server-only';

import { z } from 'zod';

import { isCodedError } from '@/lib/errors';

/**
 * Beklenmedik (kodlu olmayan) hatanın TEK satırlık yapılandırılmış günlüğü (docs/security.md "Sır ve loglama").
 * Yazılan alanlar: olay adı, işlem adı (sabit dize), sabit izin listesindeki hata sınıfı ve isteğe bağlı hata kodu
 * (`errorCode`); Prisma sürücü hatasında ayrıca sabit listedeki sürücü kodu (`driverCode`).
 * İstemciden gelen kimlik, `message`, yığın izi, girdi, e-posta, kullanıcı kimliği ve değerler ASLA yazılmaz.
 * Kodlu hatalar (kullanıcıya dönen `errorCode`), doğrulama hataları ve Next.js'in akış denetimi hataları (yönlendirme,
 * bulunamadı) günlüğe düşmez: gürültü olmaz, yalnız gerçekten beklenmedik hata görünür.
 */
export type UnexpectedKind = 'action' | 'route' | 'job';

const SOURCE = /^[A-Za-z0-9_.:-]{1,64}$/;
// İletiyle aynı güven sınırında olan `name` ve `code` serbest metin olabilir.
// Desen kontrolü kişisel veriyi elemez; yalnız sabit, bilinen değerleri kabul et.
const NAMES = new Set([
  // JavaScript çekirdeği
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  // Prisma istemcisi. Adaptör hatası (`DriverAdapterError`) uygulamaya SIZMAZ: istemci onu `PrismaClientKnownRequestError`
  // içine sarar (ayrıntısı `meta.driverAdapterError`'da), bu yüzden listede yoktur (kart 330, kendi sürücüyle ölçüldü).
  'PrismaClientKnownRequestError',
  'PrismaClientUnknownRequestError',
  'PrismaClientInitializationError',
  'PrismaClientRustPanicError',
  'PrismaClientValidationError',
  // Uygulamanın kendi hata sınıfları (her biri `this.name`'i sabit kurar; yeni sınıf eklenince bekçi testi listeyi zorlar)
  'AuditPolicyError',
  'CalendarError',
  'EmailTransportError',
  'EnvValidationError',
  'GoogleOAuthError',
  'LlmError',
  'NotImplementedError',
  'SecretBoxError',
  'StorageError',
]);
const CODES = new Set([
  // Prisma
  'P1001', // veritabanına ulaşılamıyor
  'P1002', // veritabanı sunucusu zaman aşımı
  'P1008', // işlem zaman aşımı
  'P1017', // sunucu bağlantıyı kapattı
  'P2002', // benzersizlik ihlali
  'P2003', // yabancı anahtar ihlali
  'P2010', // ham sorgu başarısız (ayrıntı `driverCode`'da)
  'P2024', // bağlantı havuzu zaman aşımı
  'P2025', // kayıt bulunamadı
  'P2028', // işlem API hatası (zaman aşımı, kapanmış işlem)
  'P2034', // yazma çakışması / kilitlenme
  'P2037', // çok fazla bağlantı
  'P2039', // model sorgusunda sürücü hatası (`meta.driverAdapterError`)
  // PostgreSQL
  '40001', // serileştirme hatası
  '40P01', // kilitlenme
  '53300', // çok fazla bağlantı
  '55P03', // kilit alınamadı (kilit zaman aşımı)
  '57014', // sorgu iptal (statement_timeout)
  '57P01', // yönetici bağlantıyı sonlandırdı
  // Node ağ hataları
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENOSPC',
  // Uygulamanın kendi sabit kodları (`LlmError`, `CalendarError`, `GoogleOAuthError`)
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

/**
 * Prisma 7, sürücü (pg) hatasını `PrismaClientKnownRequestError` içine sarar ve üst `code`'u genel tutar (ham sorgu
 * `P2010`, model sorgusu `P2039`...). Asıl pg kodu (`57014`, `57P01`, `55P03`, `40P01`) `meta.driverAdapterError.cause`
 * içindedir (kart 330, ölçüldü). Yalnız bu iki alan ve yalnız sabit listeden okunur; adres, ileti, ana makine yazılmaz.
 */
function driverCodeOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const meta = (error as { meta?: unknown }).meta;
  if (!meta || typeof meta !== 'object') return undefined;
  const adapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;
  if (!adapterError || typeof adapterError !== 'object') return undefined;
  const cause = (adapterError as { cause?: unknown }).cause;
  if (!cause || typeof cause !== 'object') return undefined;
  return safeCode((cause as Loose).originalCode) ?? safeCode((cause as Loose).code);
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
  const driverCode = driverCodeOf(error);
  return JSON.stringify({
    event: `${kind}.unexpected`,
    source: SOURCE.test(source) ? source : 'bilinmeyen',
    errorName: nameOf(error),
    ...(code ? { errorCode: code } : {}),
    ...(driverCode ? { driverCode } : {}),
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

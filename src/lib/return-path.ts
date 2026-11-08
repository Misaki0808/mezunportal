/**
 * Dönüş adresi (tur bulgusu #1, #10). Oturumsuz kullanıcı girişe, zorunlu onayı eksik kullanıcı onay
 * ekranına yönlenirken gitmek istediği yol `?donus=` ile taşınır; magic-link geri çağrısı ve onay sonrası
 * bu yola dönülür. AÇIK YÖNLENDİRME YOK: yalnız aynı site içi göreli yol kabul edilir, aksi null.
 */
export const RETURN_PATH_PARAM = 'donus';
export const RETURN_PATH_MAX_LENGTH = 512;
/**
 * `proxy.ts` her isteğe sunucu tarafında yazar (istemcinin gönderdiği aynı adlı başlık EZİLİR); sunucu
 * düzenleri dönüş yolunu buradan okur.
 */
export const REQUEST_PATH_HEADER = 'x-mezun-path';

/** Dönüş için anlamsız (döngü kuran) yollar: giriş, onay ve auth uçları. */
const NON_RETURNABLE_PAGES = ['/giris', '/onay', '/cikis'];

function isNonReturnable(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return true;
  return NON_RETURNABLE_PAGES.some((page) => pathname === page || pathname.startsWith(page + '/'));
}

const ORIGIN = 'http://donus.invalid';

/**
 * Güvenli site içi yol ya da null. Kurallar: `/` ile başlar; `//`, `/\`, ters eğik çizgi, kontrol karakteri
 * ve şema yok; çözümlenince köken değişmez; giriş/onay/çıkış/API yollarına dönülmez. Dönen değer
 * normalleştirilmiş `pathname + search` (parça `#` atılır).
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > RETURN_PATH_MAX_LENGTH) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;
  const path = url.pathname + url.search;
  if (isNonReturnable(url.pathname)) return null;
  return path;
}

/** `/giris` ya da `/onay` gibi bir hedefe güvenli dönüş parametresi ekler; yol güvensizse eklemez. */
export function withReturnPath(target: string, returnPath: unknown): string {
  const safe = safeReturnPath(returnPath);
  if (!safe || safe === '/') return target;
  return `${target}?${RETURN_PATH_PARAM}=${encodeURIComponent(safe)}`;
}

/**
 * CV onay ekranında verilen kalem kararları, sayfa yenilense de kaybolmasın diye bu sekmenin oturum belleğinde
 * (`sessionStorage`) tutulur ve CV iş kimliğine bağlanır. Yalnız "kalem anahtarı → karar" saklanır: anahtar bölüm adı ile
 * kimlik dizgesinin özetidir (kullanıcı metni taşımaz), karar kabul / üzerine yazarak kabul / ret'tir. Düzeltilmiş değerler
 * kullanıcının yazdığı veridir; saklanmaz, o kalem yenilemede "karar bekliyor"a döner. Sunucuya, URL'ye, çereze ve günlüğe
 * hiçbir şey girmez; sekme kapanınca gider. Uygulama ya da iptal sonrası silinir. Bellek kapalıysa ekran bellek olmadan çalışır.
 */
import type { CvReviewItem } from '@/contracts/cv';

const PREFIX = 'mezun.cv.decisions.';

export type RememberedDecision = { kind: 'accept' | 'reject'; overwrite: boolean };
type Stored = 'accept' | 'accept-overwrite' | 'reject';

const keyOf = (cvUploadId: string) => `${PREFIX}${cvUploadId}`;

/** Yalnız saklanabilir kararları yazar (düzeltilmiş kalem hariç); başka CV'lere ait eski kayıtları siler. */
export function rememberCvDecisions(
  cvUploadId: string,
  decisions: Record<string, { kind: 'accept' | 'reject'; values?: unknown; overwrite: boolean }>,
): void {
  try {
    const storage = window.sessionStorage;
    for (let index = storage.length - 1; index >= 0; index--) {
      const name = storage.key(index);
      if (name?.startsWith(PREFIX) && name !== keyOf(cvUploadId)) storage.removeItem(name);
    }
    const stored: Record<string, Stored> = {};
    for (const [key, decision] of Object.entries(decisions)) {
      if (decision.values) continue;
      stored[key] =
        decision.kind === 'reject' ? 'reject' : decision.overwrite ? 'accept-overwrite' : 'accept';
    }
    if (Object.keys(stored).length === 0) storage.removeItem(keyOf(cvUploadId));
    else storage.setItem(keyOf(cvUploadId), JSON.stringify(stored));
  } catch {
    /* Özel pencere ya da kapalı depolama: kararlar yalnız sayfa açıkken tutulur. */
  }
}

/** Bu CV için saklanan kararları, yalnız ekrandaki kalemlerle ve kurallarla tutarlı olanları döndürür. */
export function recallCvDecisions(
  cvUploadId: string,
  items: readonly Pick<CvReviewItem, 'key' | 'status'>[],
): Record<string, RememberedDecision> {
  try {
    const raw = window.sessionStorage.getItem(keyOf(cvUploadId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, RememberedDecision> = {};
    for (const item of items) {
      const value = (parsed as Record<string, unknown>)[item.key];
      const conflict = item.status === 'CONFLICT';
      if (value === 'reject') result[item.key] = { kind: 'reject', overwrite: false };
      else if (value === 'accept' && !conflict)
        result[item.key] = { kind: 'accept', overwrite: false };
      else if (value === 'accept-overwrite' && conflict)
        result[item.key] = { kind: 'accept', overwrite: true };
    }
    return result;
  } catch {
    return {};
  }
}

/** Çıkışta bu sekmedeki bütün CV karar kayıtlarını siler (ortak bilgisayarda sonraki kişi öncekinin kararlarını görmesin). */
export function forgetAllCvDecisions(): void {
  try {
    const storage = window.sessionStorage;
    for (let index = storage.length - 1; index >= 0; index--) {
      const name = storage.key(index);
      if (name?.startsWith(PREFIX)) storage.removeItem(name);
    }
  } catch {
    /* Bellek kapalıysa silinecek bir şey de yoktur. */
  }
}

export function forgetCvDecisions(cvUploadId: string): void {
  try {
    window.sessionStorage.removeItem(keyOf(cvUploadId));
  } catch {
    /* Bellek kapalıysa silinecek bir şey de yoktur. */
  }
}

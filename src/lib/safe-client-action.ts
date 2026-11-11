import type { ActionResult } from '@/contracts/result';

/** Ağ hatası formu düşürmez; kullanıcı aynı değerlerle yeniden deneyebilir. */
export async function safeClientAction<T>(
  action: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await action();
  } catch {
    return { ok: false, errorCode: 'SERVER_UNEXPECTED' };
  }
}

import type { ErrorCode } from '@/lib/errors';

/**
 * Beklenen durumlar (tur 2 bulgu #3): hata DEĞİL, kullanıcının rolü/aşaması gereği normal sonuçlar. Ekran bunları alarm
 * (kırmızı simge, `role="alert"`) yerine durum başlığı (h1) + TEK eylemle gösterir. Başlık ve eylem metni
 * `ui.errorState.expected` / `ui.errorState.actions` kataloğundadır; ham hata mesajı basılmaz. Listede olmayan kod gerçek
 * hata sayılır ("Bir sorun oluştu").
 */
export type ExpectedAction = 'home' | 'signIn' | 'verify' | 'consent' | 'meetings' | 'admin';

export const EXPECTED_STATES = {
  AUTH_FORBIDDEN: { action: 'home', href: '/' },
  AUTH_UNAUTHENTICATED: { action: 'signIn', href: '/giris' },
  AUTH_NOT_VERIFIED: { action: 'verify', href: '/dogrulama' },
  AUTH_ACCOUNT_SUSPENDED: { action: 'home', href: '/' },
  CONSENT_REQUIRED: { action: 'consent', href: '/onay' },
  RESOURCE_NOT_FOUND: { action: 'home', href: '/' },
  FEEDBACK_NOT_READY: { action: 'meetings', href: '/hesap/gorusmeler' },
  FEEDBACK_ALREADY_SUBMITTED: { action: 'meetings', href: '/hesap/gorusmeler' },
} as const satisfies Partial<Record<ErrorCode, { action: ExpectedAction; href: string }>>;

export type ExpectedStateCode = keyof typeof EXPECTED_STATES;

export function isExpectedState(code: ErrorCode): code is ExpectedStateCode {
  return Object.hasOwn(EXPECTED_STATES, code);
}

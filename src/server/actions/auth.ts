'use server';

import type {
  CheckEmailResponse,
  DeclareMembershipInput,
  DeclareMembershipOutput,
  RequestEmailChangeInput,
  RequestSignInLinkInput,
  SignInOptions,
  SignOutOutput,
  TestLoginInput,
  TestLoginOutput,
  VerificationState,
} from '@/contracts/auth';
import type { ActionResult } from '@/contracts/result';
import { NotImplementedError } from '@/lib/not-implemented';

/**
 * Kimlik doğrulama sunucu eylemleri — YALNIZ İMZALAR (P1-02 sözleşme PR'ı). Gövdeler servis kartında
 * yazılır: yetki → Zod (`src/contracts/auth.ts`) → servis; hatalar `ActionResult` olarak döner.
 * Hata kodları: `AUTH_ACTION_ERRORS`.
 */

/** Giriş ekranı hangi yöntemleri gösterecek? (LinkedIn anahtarı yoksa kapalı.) */
export async function getSignInOptions(): Promise<ActionResult<SignInOptions>> {
  throw new NotImplementedError('getSignInOptions');
}

/** E-posta bağlantısı iste. Kayıtlı/kayıtsız/askıda fark etmez: her zaman `CHECK_EMAIL`. */
export async function requestSignInLink(
  input: RequestSignInLinkInput,
): Promise<ActionResult<CheckEmailResponse>> {
  void input;
  throw new NotImplementedError('requestSignInLink');
}

/** Oturumdaki kullanıcının e-postasını değiştirme isteği; doğrulama bağlantısı yeni adrese gider. */
export async function requestEmailChange(
  input: RequestEmailChangeInput,
): Promise<ActionResult<CheckEmailResponse>> {
  void input;
  throw new NotImplementedError('requestEmailChange');
}

/** Öğrenci/akademisyen üyelik beyanı; alan adı `University` kaydıyla uyuşmalı (K-06). */
export async function declareMembership(
  input: DeclareMembershipInput,
): Promise<ActionResult<DeclareMembershipOutput>> {
  void input;
  throw new NotImplementedError('declareMembership');
}

/** “Doğrulama bekliyor / belge yükle / reddedildi” ekranlarının tek veri kaynağı. */
export async function getVerificationState(): Promise<ActionResult<VerificationState>> {
  throw new NotImplementedError('getVerificationState');
}

export async function signOut(): Promise<ActionResult<SignOutOutput>> {
  throw new NotImplementedError('signOut');
}

/** Yalnız `APP_ENV` local/test: seed kullanıcısı olarak oturum açar. `prod`'da `AUTH_TEST_LOGIN_DISABLED`. */
export async function signInAsTestPersona(
  input: TestLoginInput,
): Promise<ActionResult<TestLoginOutput>> {
  void input;
  throw new NotImplementedError('signInAsTestPersona');
}

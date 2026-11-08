'use server';

import { headers } from 'next/headers';

import {
  declareMembershipSchema,
  requestEmailChangeSchema,
  requestSignInLinkSchema,
  testLoginSchema,
  type CheckEmailResponse,
  type DeclareMembershipInput,
  type DeclareMembershipOutput,
  type RequestEmailChangeInput,
  type RequestSignInLinkInput,
  type SelectableDepartmentsOutput,
  type SignInOptions,
  type SignOutOutput,
  type StartLinkedInSignInOutput,
  type TestLoginInput,
  type TestLoginOutput,
  type VerificationState,
} from '@/contracts/auth';
import type { ActionResult } from '@/contracts/result';
import { isDevToolsEnabled } from '@/lib/app-env';
import { actionOk, parseInput } from '@/lib/action-result';
import { failAction } from '../fail-action';
import { getAuthEnv } from '@/lib/env';
import { codedForbidden } from '@/lib/errors';

import { getAuth } from '../auth';
import { logAuthFailure } from '../auth/log';
import { getRequestContext } from '../auth/request-context';
import { getDb } from '../db';
import { requireUser, requireUserWithoutConsent } from '../permissions';
import * as authFlow from '../services/auth-flow';
import { authFlowDeps } from './deps';

/**
 * Kimlik doğrulama sunucu eylemleri: yetki → Zod (`src/contracts/auth.ts`) → servis. Hatalar fırlatılmaz,
 * `ActionResult` olarak döner (olası kodlar: `AUTH_ACTION_ERRORS`). Giriş ve e-posta değiştirme isteği
 * adresin kayıt durumunu ele vermez.
 */

/** Giriş ekranı hangi yöntemleri gösterecek? (LinkedIn anahtarı yoksa kapalı + sebep.) */
export async function getSignInOptions(): Promise<ActionResult<SignInOptions>> {
  try {
    return actionOk(authFlow.getSignInOptions(getAuthEnv()));
  } catch (error) {
    return failAction(error);
  }
}

/** LinkedIn ile girişi başlat: yetkilendirme adresi döner. Anahtar yoksa `AUTH_PROVIDER_NOT_CONFIGURED`. */
export async function startLinkedInSignIn(): Promise<ActionResult<StartLinkedInSignInOutput>> {
  try {
    const context = await getRequestContext();
    return actionOk(await authFlow.startLinkedInSignIn(authFlowDeps(), context));
  } catch (error) {
    return failAction(error);
  }
}

/** E-posta bağlantısı iste. Kayıtlı/kayıtsız/askıda fark etmez: her zaman `CHECK_EMAIL`. */
export async function requestSignInLink(
  input: RequestSignInLinkInput,
): Promise<ActionResult<CheckEmailResponse>> {
  try {
    const parsed = parseInput(requestSignInLinkSchema, input);
    if (!parsed.ok) return parsed.failure;
    const context = await getRequestContext();
    return actionOk(
      await authFlow.requestSignInLink(authFlowDeps(), {
        email: parsed.data.email,
        returnTo: parsed.data.returnTo,
        ...context,
      }),
    );
  } catch (error) {
    return failAction(error);
  }
}

/** Oturumdaki kullanıcının e-postasını değiştirme isteği; onay bağlantıları iki adrese de gider. */
export async function requestEmailChange(
  input: RequestEmailChangeInput,
): Promise<ActionResult<CheckEmailResponse>> {
  try {
    const actor = await requireUser();
    const parsed = parseInput(requestEmailChangeSchema, input);
    if (!parsed.ok) return parsed.failure;
    const context = await getRequestContext();
    return actionOk(
      await authFlow.requestEmailChange(authFlowDeps(), actor, {
        newEmail: parsed.data.newEmail,
        headers: context.headers,
      }),
    );
  } catch (error) {
    return failAction(error);
  }
}

/** Öğrenci/akademisyen üyelik beyanı; alan adı `University` kaydıyla uyuşmalı (K-06). */
export async function declareMembership(
  input: DeclareMembershipInput,
): Promise<ActionResult<DeclareMembershipOutput>> {
  try {
    const actor = await requireUserWithoutConsent();
    const parsed = parseInput(declareMembershipSchema, input);
    if (!parsed.ok) return parsed.failure;
    return actionOk(await authFlow.declareMembership(authFlowDeps(), actor, parsed.data));
  } catch (error) {
    return failAction(error);
  }
}

/** Kayıtta seçilebilir bölümler: oturumdaki e-postanın alan adıyla eşleşen üniversite (mezunda tümü). */
export async function listSelectableDepartments(): Promise<
  ActionResult<SelectableDepartmentsOutput>
> {
  try {
    const actor = await requireUserWithoutConsent();
    return actionOk(await authFlow.listSelectableDepartments(getDb(), actor));
  } catch (error) {
    return failAction(error);
  }
}

/** “Doğrulama bekliyor / belge yükle / reddedildi” ekranlarının tek veri kaynağı. */
export async function getVerificationState(): Promise<ActionResult<VerificationState>> {
  try {
    const actor = await requireUserWithoutConsent();
    return actionOk(await authFlow.getVerificationState(getDb(), actor));
  } catch (error) {
    return failAction(error);
  }
}

/** Çıkış; oturum yoksa da başarılıdır (idempotent). */
export async function signOut(): Promise<ActionResult<SignOutOutput>> {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch (error) {
    logAuthFailure('signOut', error);
  }
  return actionOk({ signedOut: true });
}

/** Yalnız `APP_ENV` local/test: seed kullanıcısı olarak oturum açar. `prod`'da `AUTH_TEST_LOGIN_DISABLED`. */
export async function signInAsTestPersona(
  input: TestLoginInput,
): Promise<ActionResult<TestLoginOutput>> {
  try {
    // İLK iş: ortam kapısı. `prod`'da eklenti hiç yüklenmez; buradaki kontrol ikinci kilittir.
    if (!isDevToolsEnabled()) throw codedForbidden('AUTH_TEST_LOGIN_DISABLED');
    const parsed = parseInput(testLoginSchema, input);
    if (!parsed.ok) return parsed.failure;
    const auth = getAuth();
    if (!('testLogin' in auth.api)) throw codedForbidden('AUTH_TEST_LOGIN_DISABLED');
    try {
      await auth.api.testLogin({ body: parsed.data, headers: await headers() });
    } catch (error) {
      if ((error as { body?: { code?: string } }).body?.code === 'TEST_PERSONA_NOT_FOUND') {
        return { ok: false, errorCode: 'RESOURCE_NOT_FOUND' };
      }
      throw error;
    }
    return actionOk({ signedIn: true });
  } catch (error) {
    return failAction(error);
  }
}

import 'server-only';

import { safeErrorName } from '../unexpected-log';

type AuthOperation =
  | 'getSession'
  | 'signOut'
  | 'requestSignInLink'
  | 'startLinkedInSignIn'
  | 'requestEmailChange'
  | 'uploadCleanup'
  | 'documentDecisionEmail';

/** Beklenmeyen bir kimlik doğrulama hatasını günlüğe yazar: yalnız işlem adı ve hata TÜRÜ (ileti, değer, adres yok). */
export function logAuthFailure(operation: AuthOperation, error: unknown): void {
  const kind = error instanceof Error ? safeErrorName(error) : 'Error';
  process.stderr.write(`[auth] ${operation} başarısız: ${kind}\n`);
}

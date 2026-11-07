import type { Env } from '@/lib/env';
import type { ErrorCode } from '@/lib/errors';

type HealthEnv = Pick<Env, 'APP_ENV' | 'GIT_SHA'>;

export type HealthResponse =
  | {
      status: 'ok';
      /** Derleme anındaki commit; yerelde `local`. */
      sha: string;
      env: Env['APP_ENV'];
      db: 'ok';
    }
  | {
      status: 'error';
      sha: string;
      env: Env['APP_ENV'];
      db: 'down';
      /** Kararlı hata kodu; ayrıntı (adres, sürücü mesajı) yanıta girmez. */
      errorCode: ErrorCode;
    };

export function buildHealth(env: HealthEnv, databaseReachable: boolean): HealthResponse {
  const base = { sha: env.GIT_SHA ?? 'local', env: env.APP_ENV };
  return databaseReachable
    ? { status: 'ok', ...base, db: 'ok' }
    : { status: 'error', ...base, db: 'down', errorCode: 'DB_UNAVAILABLE' };
}

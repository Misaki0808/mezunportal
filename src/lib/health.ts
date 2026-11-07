import type { Env } from '@/lib/env';

export type HealthResponse = {
  status: 'ok';
  /** Derleme anındaki commit; yerelde `local`. */
  sha: string;
  env: Env['APP_ENV'];
};

export function buildHealth(env: Pick<Env, 'APP_ENV' | 'GIT_SHA'>): HealthResponse {
  return { status: 'ok', sha: env.GIT_SHA ?? 'local', env: env.APP_ENV };
}

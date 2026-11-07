import 'server-only';

import { getAuthEnv } from '@/lib/env';

import { getAuth, getAuthEmailPort } from '../auth';
import { getDb } from '../db';
import { getStorage } from '../external/storage';
import type { AuthFlowDeps } from '../services/auth-flow';
import type { ReviewDeps } from '../services/graduation-document';

/** Eylemlerin gerçek bağımlılıkları (tembel). Testler servisleri doğrudan, sahte bağımlılıkla çağırır. */
export function authFlowDeps(): AuthFlowDeps {
  return { db: getDb(), auth: getAuth(), env: getAuthEnv() };
}

export function documentDeps(): ReviewDeps {
  return {
    db: getDb(),
    storage: getStorage(),
    secret: getAuthEnv().BETTER_AUTH_SECRET,
    email: getAuthEmailPort(),
  };
}

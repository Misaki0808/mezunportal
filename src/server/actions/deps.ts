import 'server-only';

import { getAuthEnv, getLlmEnv } from '@/lib/env';

import { getAuth, getAuthEmailPort } from '../auth';
import { getDb } from '../db';
import { getLlm } from '../external/llm';
import { getStorage } from '../external/storage';
import { enqueueCvParse } from '../jobs/cv';
import type { AuthFlowDeps } from '../services/auth-flow';
import type { AdminUserDeps } from '../services/admin-users';

import type { CvDeps } from '../services/cv-shared';

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

/** Yönetim paneli: yetki işlemin içinde yeniden yüklenir; yalnız veritabanı gerekir. */
export function adminUserDeps(): AdminUserDeps {
  return { db: getDb() };
}

/** CV ayrıştırma: sağlayıcı yoksa `llm: null` (özellik kapalı); iş yükü işlem içinde kuyruğa yazılır. */
export function cvDeps(): CvDeps {
  return {
    db: getDb(),
    storage: getStorage(),
    llm: getLlm(),
    enqueue: enqueueCvParse,
    dailyLimit: getLlmEnv().CV_PARSE_DAILY_LIMIT,
  };
}

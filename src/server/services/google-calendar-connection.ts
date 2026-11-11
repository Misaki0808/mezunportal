import 'server-only';

import {
  disconnectGoogleCalendarOutputSchema,
  disconnectGoogleCalendarSchema,
  getGoogleCalendarStatusSchema,
  googleCalendarStatusSchema,
  type DisconnectGoogleCalendarInput,
  type DisconnectGoogleCalendarOutput,
  type GetGoogleCalendarStatusInput,
  type GoogleCalendarStatus,
  type GoogleConnectOutcome,
} from '@/contracts/google-calendar';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { getAuthEnv } from '@/lib/env';

import { SecretBoxError, decryptSecret, encryptSecret } from '../crypto/secret-box';
import {
  GoogleOAuthError,
  buildAuthorization,
  exchangeCode,
  readCalendarLabel,
  redirectUriFor,
  revokeToken,
  verifyAuthorization,
  type OAuthStart,
} from '../external/calendar/google-oauth';
import { loadSystemAdmin, nowOf, TX_OPTIONS } from './admin-access';
import { recordAdminAction } from './audit';

/**
 * Google Takvim bağlantısı (kart 174): sistem yöneticisi tek seferlik OAuth ile bağlar; yenileme jetonu `IntegrationConnection`
 * satırında AES-256-GCM ile şifreli durur (anahtar sunucu sırrından türer). Düz metin jeton yalnız bellekte, istek süresince
 * bulunur; log, hata, yönlendirme adresi ve işlem kaydı metadata'sına girmez. Her eylem yöneticiyi işlemin içinde yeniden doğrular.
 */
export type GoogleSettings = {
  mode: 'OFF' | 'FAKE' | 'GOOGLE';
  clientId: string | null;
  clientSecret: string | null;
  appUrl: string;
  /** Şifreleme ve durum çerezi imzası için sunucu sırrı. */
  secret: string;
};

export type GoogleConnectionDeps = {
  db: PrismaClient;
  now?: () => Date;
  settings?: () => GoogleSettings;
  fetchImpl?: typeof fetch;
  /** Bağlantı değişince adaptörün bellek önbelleği sıfırlanır (kesme sonrası eski erişim jetonu kullanılmasın). */
  onChanged?: () => void;
};

const PROVIDER = 'GOOGLE_CALENDAR' as const;
const SECRET_CONTEXT = 'IntegrationConnection:GOOGLE_CALENDAR:refreshToken';

export function readGoogleSettings(): GoogleSettings {
  const auth = getAuthEnv();
  const provider = process.env.CALENDAR_PROVIDER?.trim();
  return {
    mode: provider === 'google' ? 'GOOGLE' : provider === 'fake' ? 'FAKE' : 'OFF',
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || null,
    appUrl: auth.APP_URL,
    secret: auth.BETTER_AUTH_SECRET,
  };
}
const settingsOf = (deps: GoogleConnectionDeps) => (deps.settings ?? readGoogleSettings)();

const isConfigured = (s: GoogleSettings) => s.mode === 'GOOGLE' && !!s.clientId && !!s.clientSecret;

// ---------------------------------------------------------------------------------------------
// Adaptörün jeton deposu
// ---------------------------------------------------------------------------------------------

/**
 * Adaptör için yenileme jetonu okuyucu/işaretleyici. Çözülemeyen kayıt (sunucu sırrı değişti) "yeniden bağla" durumuna alınır ve
 * `null` döner: takvim çağrısı yapılmaz, randevu mentorun elle linkine düşer.
 */
export function createGoogleTokenStore(db: PrismaClient, secret: string) {
  return {
    async loadRefreshToken(): Promise<string | null> {
      const row = await db.integrationConnection.findUnique({
        where: { provider: PROVIDER },
        select: { status: true, refreshTokenEnc: true },
      });
      if (!row || row.status !== 'ACTIVE') return null;
      try {
        return decryptSecret(row.refreshTokenEnc, secret, SECRET_CONTEXT);
      } catch (error) {
        if (!(error instanceof SecretBoxError)) throw error;
        await db.integrationConnection.updateMany({
          where: { provider: PROVIDER },
          data: { status: 'NEEDS_RECONNECT', lastErrorCode: 'GOOGLE_TOKEN_UNREADABLE' },
        });
        return null;
      }
    },
    async markRejected(): Promise<void> {
      await db.integrationConnection.updateMany({
        where: { provider: PROVIDER },
        data: { status: 'NEEDS_RECONNECT', lastErrorCode: 'GOOGLE_TOKEN_REJECTED' },
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------------------------

export async function getGoogleCalendarStatus(
  deps: GoogleConnectionDeps,
  adminId: string,
  input: GetGoogleCalendarStatusInput = {},
): Promise<GoogleCalendarStatus> {
  getGoogleCalendarStatusSchema.parse(input);
  const now = nowOf(deps);
  const settings = settingsOf(deps);
  const row = await deps.db.$transaction(async (tx) => {
    await loadSystemAdmin(tx, adminId, now);
    return tx.integrationConnection.findUnique({
      where: { provider: PROVIDER },
      select: { status: true, accountLabel: true, connectedAt: true },
    });
  }, TX_OPTIONS);
  return googleCalendarStatusSchema.parse({
    mode: settings.mode,
    configured: isConfigured(settings),
    connection: row ? (row.status === 'ACTIVE' ? 'ACTIVE' : 'NEEDS_RECONNECT') : 'NONE',
    accountLabel: row?.accountLabel ?? null,
    connectedAt: row?.connectedAt ?? null,
    redirectUri: settings.mode === 'GOOGLE' ? redirectUriFor(settings.appUrl) : null,
  });
}

// ---------------------------------------------------------------------------------------------
// Bağlama (OAuth)
// ---------------------------------------------------------------------------------------------

/** Yetkilendirme adresini ve imzalı durum çerezini üretir; yapılandırma yoksa `null` ("not-configured"). */
export async function beginGoogleAuthorization(
  deps: GoogleConnectionDeps,
  adminId: string,
): Promise<OAuthStart | null> {
  const now = nowOf(deps);
  const settings = settingsOf(deps);
  await deps.db.$transaction((tx) => loadSystemAdmin(tx, adminId, now), TX_OPTIONS);
  if (!isConfigured(settings)) return null;
  return buildAuthorization({
    clientId: settings.clientId!,
    appUrl: settings.appUrl,
    secret: settings.secret,
    userId: adminId,
    now: now.getTime(),
  });
}

export type CompleteParams = {
  code: string | null;
  state: string | null;
  /** Google'ın `error` parametresi (örn. `access_denied`). */
  error: string | null;
  cookieValue: string | null;
};

/**
 * Google'dan dönüşü tamamlar. Beklenen başarısızlıklar özetlenmiş sonuç döner (yönlendirme için); yönetici değilse fırlatır.
 * Sıra: yönetici → yapılandırma → Google'ın reddi → çerez/`state` (CSRF) → kod değişimi → şifreli saklama + işlem kaydı.
 */
export async function completeGoogleAuthorization(
  deps: GoogleConnectionDeps,
  adminId: string,
  params: CompleteParams,
): Promise<GoogleConnectOutcome> {
  const now = nowOf(deps);
  const settings = settingsOf(deps);
  await deps.db.$transaction((tx) => loadSystemAdmin(tx, adminId, now), TX_OPTIONS);
  if (!isConfigured(settings)) return 'not-configured';
  if (params.error) return params.error === 'access_denied' ? 'denied' : 'failed';
  let verifier: string;
  try {
    ({ verifier } = verifyAuthorization({
      cookieValue: params.cookieValue,
      state: params.state,
      userId: adminId,
      secret: settings.secret,
      now: now.getTime(),
    }));
  } catch (error) {
    if (error instanceof GoogleOAuthError) return 'invalid';
    throw error;
  }
  if (!params.code || params.code.length > 2048) return 'invalid';
  let tokens;
  try {
    tokens = await exchangeCode({
      clientId: settings.clientId!,
      clientSecret: settings.clientSecret!,
      appUrl: settings.appUrl,
      code: params.code,
      verifier,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
  } catch (error) {
    if (error instanceof GoogleOAuthError) return 'failed';
    throw error;
  }
  const label = await readCalendarLabel(tokens.accessToken, deps.fetchImpl);
  const enc = encryptSecret(tokens.refreshToken, settings.secret, SECRET_CONTEXT);
  await deps.db.$transaction(async (tx: Prisma.TransactionClient) => {
    const admin = await loadSystemAdmin(tx, adminId, now);
    await tx.integrationConnection.upsert({
      where: { provider: PROVIDER },
      create: {
        provider: PROVIDER,
        refreshTokenEnc: enc,
        accountLabel: label,
        scope: tokens.scope,
        connectedById: adminId,
        connectedAt: now,
      },
      update: {
        status: 'ACTIVE',
        refreshTokenEnc: enc,
        accountLabel: label,
        scope: tokens.scope,
        connectedById: adminId,
        connectedAt: now,
        lastErrorCode: null,
      },
    });
    await recordAdminAction(tx, {
      actor: admin,
      action: 'INTEGRATION_CONNECT',
      targetType: 'INTEGRATION',
      targetId: PROVIDER,
    });
  }, TX_OPTIONS);
  deps.onChanged?.();
  return 'connected';
}

// ---------------------------------------------------------------------------------------------
// Bağlantıyı kesme
// ---------------------------------------------------------------------------------------------

/**
 * Bağlantıyı keser: satır silinir (işlem kaydıyla aynı işlemde), sonra jeton Google'da iptal edilir (en iyi çaba; başarısız olsa
 * da yerel bağlantı kesilmiştir). Bağlantı yoksa idempotent başarıdır.
 */
export async function disconnectGoogleCalendar(
  deps: GoogleConnectionDeps,
  adminId: string,
  input: DisconnectGoogleCalendarInput = {},
): Promise<DisconnectGoogleCalendarOutput> {
  disconnectGoogleCalendarSchema.parse(input);
  const now = nowOf(deps);
  const settings = settingsOf(deps);
  const plain = await deps.db.$transaction(async (tx) => {
    const admin = await loadSystemAdmin(tx, adminId, now);
    const row = await tx.integrationConnection.findUnique({
      where: { provider: PROVIDER },
      select: { id: true, refreshTokenEnc: true },
    });
    if (!row) return null;
    let token: string | null = null;
    try {
      token = decryptSecret(row.refreshTokenEnc, settings.secret, SECRET_CONTEXT);
    } catch {
      token = null; // çözülemeyen jeton iptal edilemez; yerel kayıt yine silinir
    }
    await tx.integrationConnection.delete({ where: { id: row.id } });
    await recordAdminAction(tx, {
      actor: admin,
      action: 'INTEGRATION_DISCONNECT',
      targetType: 'INTEGRATION',
      targetId: PROVIDER,
    });
    return { token };
  }, TX_OPTIONS);
  deps.onChanged?.();
  const revoked = plain?.token ? await revokeToken(plain.token, deps.fetchImpl) : false;
  return disconnectGoogleCalendarOutputSchema.parse({ disconnected: true, revoked });
}
